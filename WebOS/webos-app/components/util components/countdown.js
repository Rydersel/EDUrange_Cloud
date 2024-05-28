'use client'

import { useState, useEffect } from 'react';

const Countdown = ({ targetDate }) => {
    const [timeRemaining, setTimeRemaining] = useState(null);
    const [hasMounted, setHasMounted] = useState(false);

    useEffect(() => {
        setHasMounted(true);

        if (!timeRemaining) {
            setTimeRemaining(calculateTimeRemaining(new Date(targetDate)));
        }

        const intervalId = setInterval(() => {
            setTimeRemaining(calculateTimeRemaining(new Date(targetDate)));
        }, 1000);

        return () => clearInterval(intervalId);
    }, [targetDate]);

    function calculateTimeRemaining(target_date) {
        const now = new Date();
        const time_difference = target_date - now;
        const days = Math.floor(time_difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((time_difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((time_difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((time_difference % (1000 * 60)) / 1000);

        return { days, hours, minutes, seconds };
    }

    if (!hasMounted) {
        return <span>Loading...</span>;
    }

    if (timeRemaining) {
        const { days, hours, minutes, seconds } = timeRemaining;

        if (days < 0 || hours < 0 || minutes < 0 || seconds < 0) {
            return <span>Competition ended</span>;
        }

        return (
            <span>
                {days}d {hours}h {minutes}m {seconds}s left
            </span>
        );
    }

    return null;
};

export default Countdown;
