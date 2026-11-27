self.addEventListener("push", (event) => {
  const reminder = event.data?.json();
  event.waitUntil(
    self.registration.showNotification(reminder?.title || "Log365", {
      body: reminder?.body || "일정 알림",
      tag: reminder?.tag,
      icon: "/diary-home.png",
      data: { day: reminder?.day },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const day = event.notification.data?.day;
  const path = /^\d{4}-\d\d-\d\d$/.test(day) ? "/?day=" + day : "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        const opened = await client.navigate(path);
        if (opened) return opened.focus();
      }
      return self.clients.openWindow(path);
    })(),
  );
});
