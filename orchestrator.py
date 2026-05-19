import json
import time
import os
import requests
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from memory_system import memory
import agent_logger

load_dotenv()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "qwen/qwen-2.5-72b-instruct")

class Task:
    def __init__(self, description: str, assignee_role: str):
        self.description = description
        self.assignee_role = assignee_role
        self.status = "pending"
        self.result = ""

class Flow:
    def __init__(self, objective: str):
        self.objective = objective
        self.tasks: List[Task] = []
        self.status = "in_progress"
        self.created_at = time.time()

class Orchestrator:
    def __init__(self):
        self.current_flow: Optional[Flow] = None
    
    def start_flow(self, objective: str) -> Flow:
        self.current_flow = Flow(objective)
        print(f"[ORCHESTRATOR] Started new flow: {objective}")
        return self.current_flow

    def plan_tasks(self, objective: str) -> List[Task]:
        """
        Plans a series of tasks based on the objective using an LLM (PentAGI style).
        """
        if not OPENROUTER_API_KEY:
            print("[ORCHESTRATOR] Warning: No API key, falling back to basic heuristic.")
            return self._plan_tasks_heuristic(objective)
            
        print(f"[ORCHESTRATOR] Planning tasks for objective: {objective} using LLM...")
        
        system_prompt = """
You are the Orchestrator (PentAGI Planner). Your job is to break down the user's objective into a logical sequence of tasks.
Available roles:
- "researcher": For gathering info, web search, reading files, analyzing.
- "developer": For writing code, creating content, building.
- "executor": For running tests, executing commands, applying changes.
- "general": For conversation or simple requests.

Respond ONLY with a JSON array of objects. Each object must have:
- "description": A clear, actionable description of the task.
- "assignee_role": One of the available roles above.

Example:
[
  {"description": "Search the internet for the latest news on AI", "assignee_role": "researcher"},
  {"description": "Write a summary report based on the gathered news", "assignee_role": "developer"}
]
"""
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # We don't strictly require json_object format flag if the model doesn't support it reliably,
        # but we explicitly instruct it to return JSON.
        payload = {
            "model": OPENROUTER_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Objective: {objective}\nReturn ONLY a JSON array."}
            ]
        }
        
        try:
            response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=60)
            response.raise_for_status()
            content = response.json()['choices'][0]['message']['content']
            
            # Clean markdown JSON blocks if any
            content = content.replace("```json", "").replace("```", "").strip()
            
            parsed = json.loads(content)
            
            task_list = []
            if isinstance(parsed, list):
                task_list = parsed
            elif isinstance(parsed, dict) and "tasks" in parsed:
                task_list = parsed["tasks"]
            else:
                for v in parsed.values():
                    if isinstance(v, list):
                        task_list = v
                        break
            
            if not task_list:
                print("[ORCHESTRATOR] Failed to parse task list, using fallback.")
                return self._plan_tasks_heuristic(objective)
                
            tasks = []
            for t in task_list:
                desc = t.get("description", "Unknown task")
                role = t.get("assignee_role", "general")
                if role not in ["researcher", "developer", "executor", "general"]:
                    role = "general"
                tasks.append(Task(desc, role))
                
            print(f"[ORCHESTRATOR] LLM Planning completed. Generated {len(tasks)} tasks.")
            return tasks
            
        except Exception as e:
            print(f"[ORCHESTRATOR] Error during LLM planning: {e}. Using fallback heuristic.")
            return self._plan_tasks_heuristic(objective)

    def _plan_tasks_heuristic(self, objective: str) -> List[Task]:
        """
        Basic heuristic fallback if LLM planning fails.
        """
        tasks = []
        objective_lower = objective.lower()
        
        if "cari" in objective_lower or "research" in objective_lower or "baca" in objective_lower or "analisis" in objective_lower:
            tasks.append(Task(f"Research and gather information regarding: {objective}", "researcher"))
        
        if "buat" in objective_lower or "tulis" in objective_lower or "kode" in objective_lower or "code" in objective_lower or "program" in objective_lower:
            tasks.append(Task(f"Develop, write code, or create content for: {objective}", "developer"))
            
        if "jalankan" in objective_lower or "eksekusi" in objective_lower or "run" in objective_lower or "test" in objective_lower:
            tasks.append(Task(f"Execute operations and verify results for: {objective}", "executor"))
            
        if not tasks:
            tasks.append(Task(f"Process general request: {objective}", "general"))
            
        return tasks

    def assign_agent(self, role: str) -> str:
        """Map a PentAGI role to a specific agent_id in our system."""
        role_map = {
            "researcher": "scout",    # Web Searcher / Researcher
            "developer": "evolve",    # AlphaEvolve for coding/building
            "executor": "docs",       # Local file manipulator or terminal executor
            "general": "soft"         # Default conversational agent (Bocchi)
        }
        return role_map.get(role, "soft")

    def get_agent_context(self, agent_id: str) -> str:
        """Retrieves episodic and working memory context for the agent to append to the prompt."""
        recent_episodes = memory.get_recent_episodes(agent_id, limit=3)
        working_task = memory.get_working_memory(agent_id, "current_task")
        
        context_str = ""
        if working_task:
            context_str += f"\n[WORKING MEMORY] Current Task: {working_task}\n"
            
        if recent_episodes:
            context_str += "\n[EPISODIC MEMORY] Recent Actions:\n"
            for ep in recent_episodes:
                status = "SUCCESS" if ep.get("success") else "FAILED"
                context_str += f"- Action: {ep.get('action')} | Result: {status}\n"
                
        return context_str

# Global Orchestrator Instance
orchestrator = Orchestrator()
