import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "node:crypto";
import { quantRouter } from "./quant/routes.js";

export const MAX_CENTS = 100000000000n;
export function parseMoney(value) {
  if (
    typeof value !== "string" ||
    value.length > 16 ||
    !/^(?:0|[1-9]\d*)(?:[.,]\d{1,2})?$/.test(value)
  )
    throw Error("Valor inválido");
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > MAX_CENTS) throw Error("Valor fora do limite");
  return cents;
}
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const credentials = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    // bcrypt uses only 72 bytes; reject passwords instead of silently truncating.
    password: z
      .string()
      .min(12)
      .max(72)
      .refine((v) => Buffer.byteLength(v, "utf8") <= 72),
  })
  .strict();

export function createApp(db, options = {}) {
  const app = express();
  const origins = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((v) => v.trim());
  if (origins.some((v) => v === "*" || new URL(v).origin !== v))
    throw Error("CORS_ORIGIN deve conter origens exatas");
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: origins, exposedHeaders: ["Retry-After"] }));
  app.use(express.json({ limit: "16kb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: options.globalLimit ?? 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Muitas solicitações. Tente novamente em um minuto." },
    }),
  );
  app.use(
    "/auth",
    rateLimit({
      windowMs: 15 * 60000,
      limit: options.authLimit ?? 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: (req) => req.path === "/logout",
      message: { error: "Muitas tentativas. Aguarde 15 minutos." },
    }),
  );
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const requireAuth = asyncRoute(async (req, res, next) => {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(
      req.get("Authorization") || "",
    );
    const session =
      match &&
      (await db.session.findUnique({ where: { tokenHash: hash(match[1]) } }));
    if (!session || session.expiresAt <= new Date())
      return res
        .status(401)
        .json({ error: "Sessão expirada. Entre novamente." });
    req.userId = session.userId;
    req.tokenHash = session.tokenHash;
    next();
  });
  app.get(
    "/health",
    asyncRoute(async (_req, res) => {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: "ok", mode: "simulation" });
    }),
  );
  app.post(
    "/auth/register",
    asyncRoute(async (req, res) => {
      const parsed = credentials.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ error: "Use e-mail válido e senha de 12 a 72 bytes." });
      try {
        const user = await db.user.create({
          data: {
            email: parsed.data.email,
            passwordHash: await bcrypt.hash(parsed.data.password, 12),
            portfolio: { create: {} },
          },
        });
        res.status(201).json({ id: user.id });
      } catch (e) {
        if (e.code === "P2002")
          return res
            .status(409)
            .json({ error: "Cadastro não disponível para este e-mail." });
        throw e;
      }
    }),
  );
  const dummyHash = bcrypt.hashSync("dummy-password-unusable", 12);
  app.post(
    "/auth/login",
    asyncRoute(async (req, res) => {
      const parsed = credentials.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "Credenciais inválidas" });
      const user = await db.user.findUnique({
        where: { email: parsed.data.email },
      });
      const valid = await bcrypt.compare(
        parsed.data.password,
        user?.passwordHash || dummyHash,
      );
      if (!user || !valid)
        return res.status(401).json({ error: "Credenciais inválidas" });
      const token = crypto.randomBytes(32).toString("hex");
      await db.session.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      });
      await db.session.create({
        data: {
          tokenHash: hash(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      res.json({ token, expiresIn: 3600 });
    }),
  );
  app.post(
    "/auth/logout",
    requireAuth,
    asyncRoute(async (req, res) => {
      await db.session.deleteMany({ where: { tokenHash: req.tokenHash } });
      res.status(204).end();
    }),
  );
  app.get(
    "/portfolio",
    requireAuth,
    asyncRoute(async (req, res) => {
      const p = await db.portfolio.findUniqueOrThrow({
        where: { userId: req.userId },
        include: {
          movements: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 100,
          },
        },
      });
      res.json({
        cashCents: String(p.cashCents),
        contributedCents: String(p.contributedCents),
        withdrawnCents: String(p.withdrawnCents),
        paused: p.paused,
        movements: p.movements.map((m) => ({
          id: m.id,
          type: m.type,
          amountCents: String(m.amountCents),
          createdAt: m.createdAt,
        })),
      });
    }),
  );
  app.post(
    "/portfolio/movements",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({ type: z.enum(["DEPOSIT", "WITHDRAW"]), amount: z.string() })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "Dados inválidos" });
      let amount;
      try {
        amount = parseMoney(parsed.data.amount);
      } catch {
        return res
          .status(400)
          .json({
            error:
              "Valor inválido. Use até duas casas decimais, sem separador de milhares.",
          });
      }
      if (parsed.data.type === "DEPOSIT" && amount < 1000n)
        return res.status(400).json({ error: "Aporte mínimo R$ 10" });
      const key = req.get("Idempotency-Key") || crypto.randomUUID();
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key))
        return res.status(400).json({ error: "Chave de operação inválida" });
      // Lock only this wallet. Balance, ledger and idempotency commit atomically.
      const result = await db.$transaction(
        async (tx) => {
          const rows =
            await tx.$queryRaw`SELECT id FROM "Portfolio" WHERE "userId" = ${req.userId} FOR UPDATE`;
          const id = rows[0].id;
          const existing = await tx.cashMovement.findUnique({
            where: {
              portfolioId_idempotencyKey: {
                portfolioId: id,
                idempotencyKey: key,
              },
            },
          });
          if (existing) {
            if (
              existing.type !== parsed.data.type ||
              existing.amountCents !== amount
            )
              return {
                error: "Chave já usada para outra operação",
                status: 409,
              };
            return { id: existing.id, status: 200 };
          }
          const p = await tx.portfolio.findUniqueOrThrow({ where: { id } });
          if (parsed.data.type === "WITHDRAW" && p.cashCents < amount)
            return { error: "Saldo insuficiente", status: 409 };
          if (
            parsed.data.type === "DEPOSIT" &&
            (p.cashCents + amount > MAX_CENTS ||
              p.contributedCents + amount > MAX_CENTS)
          ) {
            return {
              error: "Limite de saldo/aportes demonstrativos atingido",
              status: 409,
            };
          }
          await tx.portfolio.update({
            where: { id },
            data:
              parsed.data.type === "DEPOSIT"
                ? {
                    cashCents: { increment: amount },
                    contributedCents: { increment: amount },
                  }
                : {
                    cashCents: { decrement: amount },
                    withdrawnCents: { increment: amount },
                  },
          });
          const movement = await tx.cashMovement.create({
            data: {
              portfolioId: id,
              type: parsed.data.type,
              amountCents: amount,
              idempotencyKey: key,
            },
          });
          return { id: movement.id, status: 201 };
        },
        { maxWait: 10000, timeout: 10000 },
      );
      res
        .status(result.status)
        .json(result.error ? { error: result.error } : { id: result.id });
    }),
  );
  app.post(
    "/portfolio/pause",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({ paused: z.boolean() })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "Dados inválidos" });
      const p = await db.portfolio.update({
        where: { userId: req.userId },
        data: parsed.data,
      });
      res.json({ paused: p.paused });
    }),
  );
  app.use("/quant", requireAuth, quantRouter(db, options));
  app.use((_req, res) =>
    res.status(404).json({ error: "Recurso não encontrado" }),
  );
  app.use((err, _req, res, _next) => {
    const status =
      err.type === "entity.too.large"
        ? 413
        : err.type === "entity.parse.failed"
          ? 400
          : 503;
    if (status === 503) console.error("API failure:", err.code || err.name);
    res
      .status(status)
      .json({
        error:
          status === 400
            ? "JSON inválido"
            : status === 413
              ? "Solicitação muito grande"
              : "Serviço indisponível. Tente novamente.",
      });
  });
  return app;
}
