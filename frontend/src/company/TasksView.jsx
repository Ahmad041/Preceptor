import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './TasksView.css';

const TasksView = () => {
    const [tasks, setTasks] = useState([]);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        try {
            const res = await axios.get('http://localhost:8000/api/tasks');
            setTasks(res.data.tasks || []);
        } catch (err) {
            console.error('Failed to fetch tasks', err);
        } finally {
            setLoading(false);
        }
    };

    const saveTasks = async (newTasks) => {
        try {
            await axios.post('http://localhost:8000/api/tasks', { tasks: newTasks });
        } catch (err) {
            console.error('Failed to save tasks', err);
        }
    };

    const addTask = () => {
        if (!newTaskTitle.trim()) return;
        const newTask = {
            id: Date.now().toString(),
            title: newTaskTitle,
            status: 'pending',
            priority: 'medium'
        };
        const updatedTasks = [...tasks, newTask];
        setTasks(updatedTasks);
        saveTasks(updatedTasks);
        setNewTaskTitle('');
    };

    const toggleTask = (id) => {
        const updatedTasks = tasks.map(t => {
            if (t.id === id) {
                return { ...t, status: t.status === 'completed' ? 'pending' : 'completed' };
            }
            return t;
        });
        setTasks(updatedTasks);
        saveTasks(updatedTasks);
    };

    const deleteTask = (id) => {
        const updatedTasks = tasks.filter(t => t.id !== id);
        setTasks(updatedTasks);
        saveTasks(updatedTasks);
    };

    if (loading) return <div className="tasks-loading">LOADING TASKS...</div>;

    const pendingTasks = tasks.filter(t => t.status !== 'completed');
    const completedTasks = tasks.filter(t => t.status === 'completed');

    return (
        <div className="tasks-view-container">
            <div className="tasks-header">
                <h2>MISSION OBJECTIVES</h2>
                <div className="tasks-input-group">
                    <input 
                        type="text" 
                        placeholder="Add new objective..." 
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addTask()}
                    />
                    <button onClick={addTask}>ADD</button>
                </div>
            </div>

            <div className="tasks-columns">
                <div className="task-column">
                    <h3>PENDING ({pendingTasks.length})</h3>
                    <div className="task-list">
                        {pendingTasks.map(task => (
                            <div className="task-card" key={task.id}>
                                <div className="task-content">
                                    <input 
                                        type="checkbox" 
                                        checked={false} 
                                        onChange={() => toggleTask(task.id)}
                                    />
                                    <span>{task.title}</span>
                                </div>
                                <button className="delete-btn" onClick={() => deleteTask(task.id)}>×</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="task-column">
                    <h3>COMPLETED ({completedTasks.length})</h3>
                    <div className="task-list completed-list">
                        {completedTasks.map(task => (
                            <div className="task-card completed" key={task.id}>
                                <div className="task-content">
                                    <input 
                                        type="checkbox" 
                                        checked={true} 
                                        onChange={() => toggleTask(task.id)}
                                    />
                                    <span>{task.title}</span>
                                </div>
                                <button className="delete-btn" onClick={() => deleteTask(task.id)}>×</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TasksView;
