"use client";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
export default function Setup(){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");
 try{const r=await fetch("/api/auth/bootstrap",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...Object.fromEntries(new FormData(event.currentTarget)),token:location.hash.slice(1)})});const d=await r.json();if(!r.ok)throw new Error(d.error);history.replaceState(null,"","/primeiro-acesso");router.replace("/login");}
 catch(e){setError(e instanceof Error?e.message:"Falha de conexão.");}finally{setBusy(false);}}
 return <div className="auth-panel" style={{minHeight:"100vh"}}><form onSubmit={submit}><span className="eyebrow">PNCP INTELLIGENCE</span><h1>Primeiro acesso</h1><p className="muted">Crie sua conta de administrador usando o convite de configuração. Essa etapa só pode ser concluída uma vez.</p><label>Nome<input name="name" required minLength={2} maxLength={150} autoComplete="name"/></label><label>E-mail<input name="email" type="email" required autoComplete="email"/></label><label>Senha<input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password"/></label>{error&&<p className="error" role="alert">{error}</p>}<button className="primary wide" disabled={busy}>{busy?"Criando…":"Criar minha conta"}</button></form></div>;
}
