import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CalendarView.css';

const CalendarView = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const res = await axios.get('http://localhost:8000/api/calendar/events');
                if (res.data.status === 'success') {
                    setEvents(res.data.events);
                } else {
                    setError(res.data.message);
                }
            } catch (err) {
                setError('Failed to connect to Calendar API.');
            } finally {
                setLoading(false);
            }
        };
        fetchEvents();
    }, []);

    if (loading) return <div className="calendar-loading">SYNCING WITH GOOGLE CALENDAR...</div>;

    return (
        <div className="calendar-view-container">
            <h2>UPCOMING EVENTS</h2>
            {error && (
                <div className="calendar-error">
                    <p>{error}</p>
                    <p className="hint">Make sure you have authenticated your Google account via the terminal/sandbox first.</p>
                </div>
            )}
            {!error && events.length === 0 && (
                <div className="no-events">No upcoming events scheduled.</div>
            )}
            {!error && events.length > 0 && (
                <div className="events-timeline">
                    {events.map(event => {
                        const startDate = new Date(event.start.dateTime || event.start.date);
                        return (
                            <div className="event-card" key={event.id}>
                                <div className="event-date">
                                    <span className="month">{startDate.toLocaleString('default', { month: 'short' })}</span>
                                    <span className="day">{startDate.getDate()}</span>
                                    <span className="time">{event.start.dateTime ? startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day'}</span>
                                </div>
                                <div className="event-details">
                                    <h3>{event.summary}</h3>
                                    {event.description && <p>{event.description}</p>}
                                    {event.location && <span className="location">📍 {event.location}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CalendarView;
