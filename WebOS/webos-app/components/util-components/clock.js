import React, { useState, useEffect } from 'react';

const Clock = (props) => {
    const month_list = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day_list = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    const [hour_12, setHour12] = useState(true);
    const [current_time, setCurrentTime] = useState(new Date());

    useEffect(() => {
        // Create interval to update time every 10 seconds
        const updateTimeInterval = setInterval(() => {
            setCurrentTime(new Date());
        }, 10 * 1000);
        
        // Cleanup interval on component unmount
        return () => clearInterval(updateTimeInterval);
    }, []); // Empty dependency array means this effect runs once on mount
    
    const { onlyTime, onlyDay } = props;
    
    let day = day_list[current_time.getDay()];
    let hour = current_time.getHours();
    let minute = current_time.getMinutes();
    let month = month_list[current_time.getMonth()];
    let date = current_time.getDate().toLocaleString();
    let meridiem = (hour < 12 ? "AM" : "PM");

    if (minute.toLocaleString().length === 1) {
        minute = "0" + minute;
    }

    if (hour_12 && hour > 12) hour -= 12;

    let display_time;
    if (onlyTime) {
        display_time = hour + ":" + minute + " " + meridiem;
    }
    else if (onlyDay) {
        display_time = day + " " + month + " " + date;
    }
    else {
        display_time = day + " " + month + " " + date + " " + hour + ":" + minute + " " + meridiem;
    }
    
    return <span>{display_time}</span>;
};

export default Clock;
