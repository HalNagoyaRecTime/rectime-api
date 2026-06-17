import { Context } from 'hono';

export type ControllerFunction = (c: Context) => Promise<any>;

export interface StudentControllerFunctions {
  getStudentById: ControllerFunction;
  getAllStudent: ControllerFunction;
}

// Event Controller Functions
export interface EventControllerFunctions {
  getAllEvents: ControllerFunction;
  getEventById: ControllerFunction;
}

// Entry Controller Functions
export interface EntryControllerFunctions {
  getAllEntries: ControllerFunction;
  getEntryById: ControllerFunction;
}

// Notification Controller Functions
export interface NotificationControllerFunctions {
  getNotifications: ControllerFunction;
  getUnreadCount: ControllerFunction;
  markNotificationAsRead: ControllerFunction;
  markAllNotificationsAsRead: ControllerFunction;
  sendTestNotification: ControllerFunction;
}

// Firebase Token Controller Functions
export interface FirebaseTokenControllerFunctions {
  registerFirebaseToken: ControllerFunction;
}
