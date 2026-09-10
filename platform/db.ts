import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * Either the root client or the client bound to an open transaction. Code that
 * runs inside `db.$transaction` must take this type and never reach for the
 * global `db`, otherwise its writes commit outside the transaction.
 */
export type DbClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
