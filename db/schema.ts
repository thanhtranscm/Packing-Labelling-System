import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const workspaces=sqliteTable('workspaces',{company:text('company').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
export const users=sqliteTable('users',{email:text('email').primaryKey(),name:text('name').notNull(),role:text('role').notNull(),active:integer('active').notNull().default(1)});
export const audit=sqliteTable('audit',{id:integer('id').primaryKey({autoIncrement:true}),company:text('company').notNull(),actor:text('actor').notNull(),action:text('action').notNull(),detail:text('detail').notNull(),created:text('created').notNull()},table=>[index('idx_audit_company_id').on(table.company,table.id)]);
