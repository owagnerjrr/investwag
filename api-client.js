// Cliente para a API demonstrativa. Tokens são mantidos apenas em memória.
const base=(import.meta.env.VITE_API_URL||"http://localhost:4000").replace(/\/$/,"");
let token=null;
async function request(path,options={}){const headers={"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})};const response=await fetch(base+path,{...options,headers:{...headers,...options.headers}});let data;try{data=await response.json()}catch{throw Error("Resposta inválida do servidor")};if(!response.ok)throw Error(data.error||"Falha na solicitação");return data}
export const demoApi={
 register:(email,password)=>request("/auth/register",{method:"POST",body:JSON.stringify({email,password})}),
 async login(email,password){const data=await request("/auth/login",{method:"POST",body:JSON.stringify({email,password})});token=data.token;return data},
 logout(){token=null},
 get authenticated(){return Boolean(token)},
 portfolio:()=>request("/portfolio"),
 movement:(type,amount)=>request("/portfolio/movements",{method:"POST",body:JSON.stringify({type,amount})}),
 pause:(paused)=>request("/portfolio/pause",{method:"POST",body:JSON.stringify({paused})})
};
