import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { signature } from "../server/pilot/routes.js";
const require = createRequire(
  new URL("../server/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
test.skip(
  process.env.E2E_PILOT !== "1",
  "Dedicated V3 build required; legacy suite uses flags unchanged",
);
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("Dedicated _test database required");
const db = new PrismaClient(),
  prefix = "pilot-e2e-" + crypto.randomUUID();
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await db.$disconnect();
});
test("piloto sem configuração manual: aporte idempotente, ciclo sem navegador, pausa e emergência", async ({
  page,
  context,
  request,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = `${prefix}-${info.project.name}@example.test`,
    password = "Pilot-E2E-Password-2026";
  await page.goto("/");
  await page
    .getByRole("button", { name: "Criar conta demonstrativa", exact: true })
    .click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Cadastrar e entrar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Piloto automático fictício",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /Autorizo somente/ }).check();
  await page
    .getByRole("button", { name: "Autorizar piloto fictício", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Adicionar ao piloto", exact: true }),
  ).toBeVisible();
  const keys = [];
  let lose = true;
  await page.route("**/pilot", async (r) => {
    if (
      r.request().method() !== "POST" ||
      r.request().postDataJSON().action !== "DEPOSIT"
    )
      return r.continue();
    keys.push(r.request().headers()["idempotency-key"]);
    if (!lose) return r.continue();
    lose = false;
    const response = await r.fetch();
    expect(response.status()).toBe(200);
    await r.fulfill({
      status: 200,
      contentType: "text/html",
      body: "Temporary response after committed fictitious deposit",
    });
  });
  await page
    .getByRole("button", { name: "Adicionar ao piloto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar ação do piloto pendente" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar ação do piloto pendente" })
    .click();
  await expect(
    page.getByRole("button", { name: "Atualizar painel do piloto" }),
  ).toBeEnabled();
  expect(keys[0]).toBe(keys[1]);
  await page.unroute("**/pilot");
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  let account = await db.pilotAccount.findUniqueOrThrow({
    where: { userId: user.id },
  });
  expect(account.state.cashCents).toBe("1000");
  expect(account.state.realizedCents).toBe("0");
  expect(
    (await db.portfolio.findUniqueOrThrow({ where: { userId: user.id } }))
      .cashCents,
  ).toBe(0n);
  await page.close();
  const timestamp = String(Date.now()),
    secret = "e2e-only-scheduler-secret-".repeat(3);
  const job = await request.post("http://127.0.0.1:4000/internal/pilot/tick", {
    data: {},
    headers: {
      "X-Pilot-Timestamp": timestamp,
      "X-Pilot-Signature": signature(secret, timestamp),
    },
  });
  expect(job.status()).toBe(200);
  account = await db.pilotAccount.findUniqueOrThrow({
    where: { userId: user.id },
  });
  expect(account.lastRun).not.toBeNull();
  expect(account.state.scanner[0].source).toContain("SYNTHETIC");
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pausar piloto", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Valor para o piloto em reais").fill("11");
  await page
    .getByRole("button", { name: "Retirar do piloto", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Saldo disponível insuficiente",
  );
  await page
    .getByRole("button", { name: "Pausar piloto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retomar piloto", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Retomar piloto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Emergência do piloto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retomar piloto", exact: true }),
  ).toBeDisabled();
  await page
    .getByText("Pesquisa, estratégias, risco e auditoria do piloto", {
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("cell", { name: /SYNTHETIC PILOT FIXTURE/ }),
  ).toBeVisible();
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    body: document.documentElement.scrollWidth,
  }));
  expect(width.body).toBeLessThanOrEqual(width.viewport);
  expect(errors).toEqual([]);
  await page
    .locator(".pilot-area")
    .evaluate((e) => e.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: `test-results/pilot-${info.project.name}.png`,
    fullPage: false,
  });
  await page
    .getByText("Carteira anterior e laboratório 2.0", { exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Minha carteira", exact: true }),
  ).toBeVisible();
});
test("emergência permanece disponível durante aporte com resposta incerta", async ({
  page,
}, info) => {
  const email = `${prefix}-pending-${info.project.name}@example.test`;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Criar conta demonstrativa", exact: true })
    .click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page
    .getByLabel("Senha", { exact: true })
    .fill("Pilot-E2E-Password-2026");
  await page
    .getByRole("button", { name: "Cadastrar e entrar", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Autorizo somente/ }).check();
  await page
    .getByRole("button", { name: "Autorizar piloto fictício", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Adicionar ao piloto", exact: true }),
  ).toBeVisible();
  let first = true;
  const keys = [];
  await page.route("**/pilot", async (r) => {
    if (
      r.request().method() !== "POST" ||
      r.request().postDataJSON().action !== "DEPOSIT"
    )
      return r.continue();
    keys.push(r.request().headers()["idempotency-key"]);
    if (!first) return r.continue();
    first = false;
    const response = await r.fetch();
    await r.fulfill({
      status: 200,
      contentType: "text/html",
      body: "Lost fictitious deposit response",
    });
  });
  await page
    .getByRole("button", { name: "Adicionar ao piloto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar ação do piloto pendente" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Emergência do piloto", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Emergência do piloto", exact: true })
    .click();
  await expect(
    page.getByText("Interrompido por emergência", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar ação do piloto pendente" })
    .click();
  await expect(
    page.getByRole("button", { name: "Atualizar painel do piloto" }),
  ).toBeEnabled();
  expect(keys[0]).toBe(keys[1]);
  const user = await db.user.findUniqueOrThrow({ where: { email } }),
    a = await db.pilotAccount.findUniqueOrThrow({ where: { userId: user.id } });
  expect(a.status).toBe("EMERGENCY");
  expect(a.state.cashCents).toBe("1000");
  expect(
    await db.pilotEvent.count({ where: { accountId: a.id, kind: "DEPOSIT" } }),
  ).toBe(1);
});
