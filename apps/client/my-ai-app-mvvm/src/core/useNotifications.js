import { useContext } from 'react';
import { NotificationContext } from './notificationContextValue';

export const useNotifications = () => useContext(NotificationContext);
