'use client';

import * as React from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useTheme } from 'next-themes';
import dayjs, { Dayjs } from 'dayjs';

import { cn } from '@/lib/utils';

export interface CalendarProps {
  className?: string;
  selected?: Date;
  defaultMonth?: Date;
  onSelect?: (date: Date | undefined) => void;
  disabled?: boolean | ((date: Date) => boolean);
  mode?: 'single' | 'range' | 'multiple';
  [key: string]: any;
}

function Calendar({
  className,
  selected,
  defaultMonth,
  onSelect,
  disabled = false,
  ...props
}: CalendarProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Create a theme that matches the current app theme
  const theme = React.useMemo(
    () =>
      createTheme({
        typography: {
          fontFamily: 'inherit', // Use the same font as the rest of the site
        },
        palette: {
          mode: isDark ? 'dark' : 'light',
          primary: {
            main: isDark ? '#22c55e' : '#16a34a', // Green color that matches our app theme
          },
          background: {
            default: isDark ? 'hsl(143.8 50% 3%)' : 'hsl(0 0% 100%)',
            paper: isDark ? 'hsl(143.8 50% 5%)' : 'hsl(0 0% 98%)',
          },
          text: {
            primary: isDark ? 'hsl(143.8 5% 90%)' : 'hsl(222.2 84% 4.9%)',
            secondary: isDark ? 'hsl(143.8 5% 60%)' : 'hsl(220 8.9% 30%)',
          },
        },
      }),
    [isDark]
  );

  // Convert between Date and Dayjs
  const selectedDayjs = selected ? dayjs(selected) : null;
  const defaultMonthDayjs = defaultMonth ? dayjs(defaultMonth) : undefined;

  const handleDateChange = (newDate: Dayjs | null) => {
    if (onSelect) {
      onSelect(newDate ? newDate.toDate() : undefined);
    }
  };

  // Filter out problematic props
  const { initialFocus, ...filteredProps } = props;

  // Handle the disabled prop
  let shouldDisableDate: ((date: Dayjs) => boolean) | undefined;
  let isReadOnly = false;

  if (typeof disabled === 'function') {
    // If disabled is a function, convert it to work with Dayjs
    shouldDisableDate = (date: Dayjs) => disabled(date.toDate());
  } else if (disabled === true) {
    // If disabled is true, make the calendar read-only
    isReadOnly = true;
  }

  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <div className={cn('p-3 font-sans', className)}>
          <DateCalendar
            value={selectedDayjs}
            onChange={handleDateChange}
            defaultValue={defaultMonthDayjs}
            readOnly={isReadOnly}
            shouldDisableDate={shouldDisableDate}
            sx={{
              width: '100%',
              fontFamily: 'inherit',
              '& .MuiDayCalendar-header': {
                display: 'flex',
                justifyContent: 'space-between',
              },
              '& .MuiPickersDay-root': {
                fontSize: '0.875rem',
                margin: '2px',
                borderRadius: '0.375rem',
                fontFamily: 'inherit',
              },
              '& .MuiTypography-root': {
                fontFamily: 'inherit',
              },
              '& .MuiPickersCalendarHeader-label': {
                fontFamily: 'inherit',
                fontSize: '0.875rem',
                fontWeight: 500,
              },
              '& .MuiDayCalendar-weekDayLabel': {
                fontFamily: 'inherit',
                fontSize: '0.75rem',
              },
            }}
            {...filteredProps}
          />
        </div>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

Calendar.displayName = 'Calendar';

export { Calendar };
