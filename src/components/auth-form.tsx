"use client";
import {FormEvent,useState} from "react";
import Link from "next/link";
export function AuthForm({mode}:{mode:"login"|"recover"|"reset"}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function submit(e:FormEvent<HTMLFormElement>){
 e.preventDefault();setBusy(true);setMessage("");
 const fields=Object.fromEntries(new FormData(e.currentTarget));
 if(mode==="reset")fields.token=location.hash.slice(1);
 try{const r=await fetch("/api/auth/"+mode,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(fields)});const d=await r.json();if(!r.ok)throw new Error(d.error);if(mode==="login")location.href="/dashboard";else if(mode==="reset")location.href="/login";else setMessage(d.message);}catch(e){setMessage(e instanceof Error?e.message:"Falha de conexão.");}finally{setBusy(false);}
 }
 return <div className="auth-page"><section className="auth-story"><div className="brand"><span className="brand-symbol">P</span><span>PNCP<strong>Intelligence</strong></span></div><div><span className="eyebrow">INTELIGÊNCIA COMERCIAL</span><h1>Encontre a próxima oportunidade da sua empresa.</h1><p>Dados públicos organizados. Compatibilidade explicada. Decisões bem informadas.</p></div><small>Portal independente de inteligência. Não é um serviço oficial do governo.</small></section><section className="auth-panel"><form onSubmit={submit}><span className="eyebrow">PNCP INTELLIGENCE</span><h2>{mode==="login"?"Bem-vindo de volta":mode==="recover"?"Recuperar acesso":"Definir nova senha"}</h2><p className="muted">{mode==="login"?"Entre para acompanhar suas oportunidades.":mode==="recover"?"Informe o e-mail cadastrado.":"Use uma senha com pelo menos 12 caracteres."}</p>{mode!=="reset"&&<label>E-mail<input type="email" name="email" autoComplete="email" required maxLength={254}/></label>}{mode!=="recover"&&<label>Senha<input type="password" name="password" autoComplete={mode==="login"?"current-password":"new-password"} required minLength={mode==="reset"?12:1} maxLength={72}/></label>}{message&&<p role="status" className="notice">{message}</p>}<button disabled={busy} className="primary wide">{busy?"Aguarde…":mode==="login"?"Entrar":mode==="recover"?"Enviar instruções":"Salvar senha"}</button><Link className="text-link" href={mode==="login"?"/recuperar-senha":"/login"}>{mode==="login"?"Esqueceu sua senha?":"Voltar ao login"}</Link></form></section></div>;
}
