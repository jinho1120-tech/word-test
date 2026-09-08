import { pgTable, serial, varchar, text, timestamp, integer } from "drizzle-orm/pg-core"

export const wordEntries = pgTable("word_entries", {
  id: serial("id").primaryKey(),
  profile: varchar("profile", { length: 20 }).notNull(),
  assignmentDate: varchar("assignment_date", { length: 20 }).notNull(),
  word: varchar("word", { length: 100 }).notNull(),
  meaning: varchar("meaning", { length: 200 }).notNull(),
  example: text("example"),
  // ▼ 틀린 횟수를 추적하는 칸이 새로 추가되었습니다 ▼
  wrongCount: integer("wrong_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export type WordEntry = typeof wordEntries.$inferSelect
export type NewWordEntry = typeof wordEntries.$inferInsert
