import {test} from "node:test";import assert from "node:assert/strict";import {INITIAL,parseBRL,transition} from "./ledger.js";
test("converte reais em centavos sem float na carteira",()=>{assert.equal(parseBRL("10,25"),1025);assert.throws(()=>parseBRL("1.234"));});
test("bloqueia aporte inferior a dez reais",()=>assert.throws(()=>transition(INITIAL,{type:"DEPOSIT",amount:"9,99"})));
test("aporte e saque preservam resultado",()=>{const a=transition(INITIAL,{type:"DEPOSIT",amount:"10"});const b=transition(a,{type:"WITHDRAW",amount:"5"});assert.equal(b.cashCents,20500);assert.equal(b.cashCents-b.contributedCents+b.withdrawnCents,0)});
test("não permite saque maior que saldo",()=>assert.throws(()=>transition(INITIAL,{type:"WITHDRAW",amount:"201"})));
test("pausa preserva patrimônio",()=>{const s=transition(INITIAL,{type:"TOGGLE"});assert.equal(s.paused,true);assert.equal(s.cashCents,20000)});
