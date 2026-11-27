import {
  integer,
  index,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const records = sqliteTable(
  "diary_records",
  {
    owner: text("owner").notNull(),
    id: text("id").notNull(),
    period: text("period").notNull(),
    content: text("content").notNull(),
    version: integer("version").notNull(),
  },
  (row) => [primaryKey({ columns: [row.owner, row.id] })],
);

export const pushState = sqliteTable("push_state", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
});
export const pushDevices = sqliteTable(
  "push_devices",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    subscription: text("subscription").notNull(),
    created: integer("created").notNull(),
  },
  (t) => [index("push_devices_owner").on(t.owner)],
);
export const pushDeliveries = sqliteTable(
  "push_deliveries",
  {
    device: text("device").notNull(),
    event: text("event").notNull(),
    occurrence: text("occurrence").notNull(),
    lease: integer("lease").notNull(),
    due: integer("due").notNull(),
    sent: integer("sent").notNull(),
  },
  (t) => [primaryKey({ columns: [t.device, t.event, t.occurrence] })],
);

export const googleLinks = sqliteTable("google_calendar_links", {
  owner: text("owner").primaryKey(),
  generation: text("generation").notNull(),
  tokens: text("tokens").notNull(),
  calendar: text("calendar"),
});

export const googleStates = sqliteTable("google_calendar_states", {
  owner: text("owner").primaryKey(),
  digest: text("digest").notNull(),
  verifier: text("verifier").notNull(),
  expires: integer("expires").notNull(),
});
