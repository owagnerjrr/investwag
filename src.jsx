import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {demoApi} from "./api-client.js";
import "./style.css";
const fmt=v=>(Number(v)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
function App(){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[mode,setMode]=useState("login");
 const [portfolio,setPortfolio]=useState(null),[amount,setAmount]=useState("10"),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function load(){setPortfolio(await demoApi.portfolio())}
 async function login(e){e.preventDefault();setBusy(true);setError("");try{if(mode==="register")await demoApi.register(email,password);await demoApi.login(email,password);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function change(type){setBusy(true);setError("");try{await demoApi.movement(type,amount.replace(",","."));await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function pause(){setBusy(true);setError("");try{await demoApi.pause(!portfolio.paused);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 function logout(){demoApi.logout();setPortfolio(null);setPassword("");setError("")}
 const cash=portfolio?BigInt(portfolio.cashCents):0n,contributed=portfolio?BigInt(portfolio.contributedCents):0n,withdrawn=portfolio?BigInt(portfolio.withdrawnCents):0n;
 return <main><header><h1>◈ WJ QUANT</h1><span>{portfolio?(portfolio.paused?"⏸ PAUSADO":"● AGUARDANDO OPORTUNIDADES"):"● SIMULAÇÃO"}</span></header>
 <p className="warning">AMBIENTE DE DEMONSTRAÇÃO · Valores fictícios · Sem operações financeiras reais</p>
 {!portfolio?<section><h2>{mode==="login"?"Entrar":"Criar conta demonstrativa"}</h2><form onSubmit={login}><label>E-mail<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required minLength={mode==="register"?12:1} autoComplete={mode==="register"?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="actions"><button disabled={busy} type="submit">{busy?"Aguarde...":mode==="login"?"Entrar":"Cadastrar e entrar"}</button><button type="button" className="alt" onClick={()=>{setMode(mode==="login"?"register":"login");setError("")}}>{mode==="login"?"Criar conta":"Já tenho conta"}</button></div></form><p>É necessário iniciar a API e o PostgreSQL para entrar. A senha de cadastro deve ter pelo menos 12 caracteres.</p></section>:<>
 <section className="hero"><p>Meu patrimônio</p><h2>{fmt(cash)}</h2><strong>Resultado simulado: {fmt(cash-contributed+withdrawn)}</strong></section>
 <div className="grid"><article>Capital aportado<strong>{fmt(contributed)}</strong></article><article>Disponível<strong>{fmt(cash)}</strong></article><article>Investido<strong>{fmt(0)}</strong></article><article>Retirado<strong>{fmt(withdrawn)}</strong></article></div>
 <section><h3>Movimentar saldo fictício</h3><label>Valor em reais<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><div className="actions"><button disabled={busy} onClick={()=>change("DEPOSIT")}>Adicionar dinheiro</button><button disabled={busy} className="alt" onClick={()=>change("WITHDRAW")}>Retirar dinheiro</button></div><p>Saldo e movimentações são armazenados no banco de dados de demonstração. Não existe PIX ou corretora conectada.</p></section>
 <section><h3>Controle do WJ Quant</h3><p>O motor de investimentos ainda não foi implementado.</p><button disabled={busy} className="alt" onClick={pause}>{portfolio.paused?"Reativar":"Pausar"} robô</button></section>
 <section><h3>Movimentações simuladas</h3>{portfolio.movements.length?portfolio.movements.map(m=><p key={m.id}>{m.type==="DEPOSIT"?"Aporte":"Retirada"} de {fmt(m.amountCents)} · {new Date(m.createdAt).toLocaleString("pt-BR")}</p>):<p>Nenhuma movimentação registrada.</p>}</section>
 <button className="alt" onClick={logout}>Sair</button></>}
 {error&&<p role="alert" style={{color:"#ff9b9b"}}>{error}</p>}
 <footer>WJ Quant · Somente simulação. A sessão expira após 1 hora e será necessário entrar novamente. Nunca use dinheiro real.</footer></main>
}
createRoot(document.getElementById("root")).render(<App/>);
