import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../server/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("Dedicated _test database required");
const db = new PrismaClient(),
  prefix = "quant-e2e-" + crypto.randomUUID();
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await db.$disconnect();
});
test("laboratório: scanner, estratégia, backtest, paper, Guard e carteira preservada", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta demonstrativa" }).click();
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(`${prefix}-${info.project.name}@example.test`);
  await page
    .getByLabel("Senha", { exact: true })
    .fill("Quant-E2E-Password-2026");
  await page.getByRole("button", { name: "Cadastrar e entrar" }).click();
  await expect(
    page.getByRole("heading", { name: "Minha carteira", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Abrir laboratório quantitativo" })
    .click();
  await page
    .getByRole("button", { name: "Monitorar ativo", exact: true })
    .click();
  await expect(
    page.getByLabel("Ativo para análise e simulação"),
  ).not.toHaveValue("");
  await page.getByRole("button", { name: "Buscar dados e analisar" }).click();
  await expect(
    page.getByRole("cell", { name: /SYNTHETIC E2E FIXTURE/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salvar estratégia" }).click();
  await expect(page.getByLabel("Estratégia para simulação")).not.toHaveValue(
    "",
  );
  await page
    .getByLabel(
      "Aceitar liquidez desconhecida somente nesta simulação de referência",
    )
    .check();
  await page.getByRole("button", { name: "Criar backtest histórico" }).click();
  let firstBatch = true;
  const keys = [];
  await page.route("**/quant/runs/*/step", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (!firstBatch) return route.continue();
    firstBatch = false;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "Temporary response after committed batch",
    });
  });
  await page
    .getByRole("button", { name: "Processar próximo lote", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar ação quantitativa pendente" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar ação quantitativa pendente" })
    .click();
  await expect(
    page.getByRole("button", { name: "Atualizar laboratório", exact: true }),
  ).toBeEnabled();
  expect(keys[0]).toBe(keys[1]);
  await page.unroute("**/quant/runs/*/step");
  for (let i = 0; i < 4; i++) {
    const button = page.getByRole("button", {
      name: "Processar próximo lote",
      exact: true,
    });
    if (await button.isEnabled()) {
      await button.click();
      await expect(
        page.getByRole("button", {
          name: "Atualizar laboratório",
          exact: true,
        }),
      ).toBeEnabled();
    }
  }
  await expect(
    page.getByRole("heading", { name: /Backtest histórico.*COMPLETED/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Curva de patrimônio fictício" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Consultar auditoria", exact: true })
    .click();
  await expect(page.getByText(/Ordem fictícia BUY/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Iniciar paper trading fictício" })
    .click();
  const paper = page.locator(".quant-run").filter({
    has: page.getByRole("heading", { name: /Paper trading.*RUNNING/ }),
  });
  await paper
    .getByRole("button", { name: "Processar próximo lote", exact: true })
    .click();
  await expect(
    page.getByText("Guard bloqueou: GLOBAL_PAUSED", { exact: true }),
  ).toBeVisible();
  await paper
    .getByRole("button", { name: "Interrupção de emergência", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Paper trading.*EMERGENCY/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retomar sessão", exact: true }).first(),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Simular aporte", exact: true })
    .click();
  await expect(page.locator(".hero h2")).toHaveText(/10,00/);
  const width = await page.evaluate(() => ({
    viewport: window.innerWidth,
    body: document.documentElement.scrollWidth,
  }));
  expect(width.body).toBeLessThanOrEqual(width.viewport);
  await page
    .getByRole("heading", { name: "WJ Quant 2.0 · Laboratório" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/quant-${info.project.name}.png`,
    fullPage: false,
  });
  expect(errors).toEqual([]);
});
