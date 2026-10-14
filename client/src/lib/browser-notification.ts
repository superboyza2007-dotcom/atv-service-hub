export type BrowserNotificationOptions = NotificationOptions;

/**
 * Chrome on Android does not allow `new Notification(...)`; use the registered
 * service worker when available and fail silently when notifications are not
 * supported or permission is unavailable.
 */
export function showBrowserNotification(title: string, options: BrowserNotificationOptions): void {
  if (typeof window === "undefined" || typeof Notification === "undefined" || Notification.permission !== "granted") return;

  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistration().then(registration => {
      if (registration) return registration.showNotification(title, options);
      try {
        void new Notification(title, options);
      } catch {
        // Android browsers without an active service worker reject the constructor.
      }
    }).catch(() => undefined);
    return;
  }

  try {
    void new Notification(title, options);
  } catch {
    // Notification is optional; the in-app notice remains available.
  }
}
