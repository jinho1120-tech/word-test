import { pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core"

export const wordEntries = pgTable("word_entries", {
  id: serial("id").primaryKey(),
  profile: text("profile").notNull(),
  word: text("word").notNull(),
  meaning: text("meaning").notNull(),
  example: text("example"),
  assignmentDate: date("assignment_date").notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type WordEntry = typeof wordEntries.$inferSelect
