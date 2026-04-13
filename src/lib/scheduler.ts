import { Task, UnforeseenEvent } from '../types';
import { addDays, format, isBefore, isWeekend, parseISO, startOfDay } from 'date-fns';

export function distributeTasks(
  tasks: Task[],
  dailyCapacityMinutes: number,
  unforeseenEvents: UnforeseenEvent[] = [],
  allowWeekends: boolean = false
): Record<string, Task[]> {
  const schedule: Record<string, Task[]> = {};
  
  // Filter only pending tasks
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  
  // Separate fixed and flexible
  const fixedTasks = pendingTasks.filter(t => t.isFixed);
  let flexibleTasks = pendingTasks.filter(t => !t.isFixed);
  
  const priorityWeight: Record<string, number> = { "Alta": 3, "Média": 2, "Baixa": 1 };
  const today = startOfDay(new Date());

  // Allocate fixed tasks first
  fixedTasks.forEach(task => {
    const taskDate = startOfDay(parseISO(task.deadline || task.endDate || task.startDate || new Date().toISOString()));
    const dateKey = format(taskDate, 'yyyy-MM-dd');
    if (!schedule[dateKey]) schedule[dateKey] = [];
    schedule[dateKey].push(task);
  });

  let currentDate = today;
  let daysLookahead = 0;

  // Distribute flexible tasks
  while (flexibleTasks.length > 0 && daysLookahead < 365) {
    const dateKey = format(currentDate, 'yyyy-MM-dd');

    // Skip weekends if not allowed
    if (!allowWeekends && isWeekend(currentDate)) {
      currentDate = addDays(currentDate, 1);
      daysLookahead++;
      continue;
    }

    // Calculate capacity for this specific day
    const eventsToday = unforeseenEvents.filter(e => e.date === dateKey);
    const lostCapacity = eventsToday.reduce((acc, e) => acc + e.duration, 0);
    const usedCapacity = (schedule[dateKey] || []).reduce((acc, t) => acc + t.timeEstimate, 0);
    let remainingCapacity = Math.max(0, dailyCapacityMinutes - lostCapacity) - usedCapacity;

    // Find available tasks (startDate <= currentDate)
    const availableTasks = flexibleTasks.filter(t => {
      if (!t.startDate) return true;
      return startOfDay(parseISO(t.startDate)) <= currentDate;
    });

    // Sort available tasks
    availableTasks.sort((a, b) => {
      if (priorityWeight[a.priority] !== priorityWeight[b.priority]) {
        return priorityWeight[b.priority] - priorityWeight[a.priority];
      }
      const dateA = new Date(a.deadline || a.endDate || '2099-01-01').getTime();
      const dateB = new Date(b.deadline || b.endDate || '2099-01-01').getTime();
      if (dateA !== dateB) return dateA - dateB;
      
      return a.timeEstimate - b.timeEstimate;
    });

    let allocatedAny = false;

    for (const task of availableTasks) {
      const taskDeadline = startOfDay(parseISO(task.deadline || task.endDate || '2099-01-01'));
      const isDueTodayOrPast = isBefore(taskDeadline, addDays(currentDate, 1));

      // Allocate if it fits OR if it's due today/past (must be done)
      if (remainingCapacity >= task.timeEstimate || isDueTodayOrPast) {
        if (!schedule[dateKey]) schedule[dateKey] = [];
        schedule[dateKey].push(task);
        remainingCapacity -= task.timeEstimate;
        flexibleTasks = flexibleTasks.filter(t => t.id !== task.id);
        allocatedAny = true;
      }
      
      if (remainingCapacity <= 0) break;
    }

    // Move to next day
    currentDate = addDays(currentDate, 1);
    daysLookahead++;
  }

  return schedule;
}
