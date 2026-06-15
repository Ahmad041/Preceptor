# GitHub Repo Search

## Goal
Implement a real GitHub repository search in the AI Desktop App using the GitHub REST API to replace the current mock data.

## Tasks
- [x] Task 1: Update `SettingsMenu.jsx` UI → Verify: A "GitHub Search Query" input field is visible under the SYSTEM UPDATE tab.
- [x] Task 2: Update `SettingsMenu.jsx` EventSource → Verify: The stream URL appends `&query={value}` to pass the search query to the backend.
- [x] Task 3: Update `main.py` backend → Verify: The `/api/system/update/stream` endpoint accepts a `query` parameter and uses `requests.get` to fetch trending repos from `https://api.github.com/search/repositories`.
- [x] Task 4: Inject repo data into LLM → Verify: The fetched repo names and descriptions are injected into `github_context` instead of the mock data.

## Done When
- [ ] Clicking "Check For Updates" queries real GitHub repositories based on the user's topic.
- [ ] The fetched repo data streams to the terminal logs and is summarized by Ollama.
