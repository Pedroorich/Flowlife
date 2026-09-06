import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { sendFlowNotification } from "./notificationEngine";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sendBrowserNotification(title: string, options?: NotificationOptions) {
  sendFlowNotification({
    title,
    body: options?.body || '',
    tag: options?.tag
  }).catch(console.error);
}

