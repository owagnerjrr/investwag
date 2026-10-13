import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {INITIAL,transition,validateState} from "./ledger.js";
import "./style.css";
const KEY="wj-quant-demo-v1";
function load(){try{const data=JSON.parse(localStorage.getItem(KEY));return validateState(data)?data:INITIAL}catch{return INITIAL}}
function App(){
 const [state,setState]=useState(load),[value,setValue]=useState("10"),[error,setError]=useState("");
 const fmt=c=>(c/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
 function act(action){try{const next=transition(state,action);localStorage.setItem(KEY,JSON.stringify(next));setState(next);setError("")}catch(e){setError(e.message)}}
 const result=state.cashCents-state.contributedCents+state.withdrawnCents;
 return <main>
 <header><h1>◈ WJ QUANT</h1><span>{state.paused?"⏸ PAUSADO":"● AGUARDANDO OPORTUNIDADES"}</span></header>
 <p className="warning">DEMONSTRAÇÃO · Valores fictícios · Sem operações reais</p>
 <section className="hero"><p>Meu patrimônio</p><h2>{fmt(state.cashCents)}</h2><strong>Resultado demonstrativo: {fmt(result)}</strong></section>
 <div className="grid"><article>Capital aportado<strong>{fmt(state.contributedCents)}</strong></article><article>Disponível<strong>{fmt(state.cashCents)}</strong></article><article>Investido<strong>{fmt(0)}</strong></article><article>Retirado<strong>{fmt(state.withdrawnCents)}</strong></article></div>
 <section><h3>Movimentar saldo fictício</h3><label>Valor em reais <input value={value} onChange={e=>setValue(e.target.value)} inputMode="decimal"/></label>
 <div className="actions"><button onClick={()=>act({type:"DEPOSIT",amount:value})}>Adicionar dinheiro</button><button className="alt" onClick={()=>act({type:"WITHDRAW",amount:value})}>Retirar dinheiro</button></div>
 {error&&<p role="alert" style={{color:"#ff9696"}}>{error}</p>}
 <p>Não existe PIX, corretora ou transferência nesta demonstração.</p></section>
 <section><h3>Controle do WJ Quant</h3><p>O motor de negociação ainda não foi implementado. O botão controla apenas o estado demonstrativo.</p><button className="alt" onClick={()=>act({type:"TOGGLE"})}>{state.paused?"Reativar":"Pausar"} robô</button></section>
 <section><h3>Atividade demonstrativa</h3>{state.events.length?state.events.map((event,i)=><p key={i}>{event.type==="DEPOSIT"?"Aporte simulado":event.type==="WITHDRAW"?"Retirada simulada":event.type==="PAUSED"?"Robô pausado":"Robô reativado"}{event.amountCents?": "+fmt(event.amountCents):""} · {new Date(event.at).toLocaleString("pt-BR")}</p>):<p>Nenhuma movimentação registrada.</p>}</section>
 <footer>Dados fictícios salvos apenas neste navegador. Sem login, banco, API ou sincronização entre dispositivos. Não usar com dinheiro real.</footer>
 </main>
}
createRoot(document.getElementById("root")).render(<App/>);
