import {notFound} from "next/navigation";
import {requireAdmin} from "@/lib/auth";
import {Workspace} from "@/components/workspace";
export default async function Page({params}:{params:Promise<{screen:string[]}>}){
 const {screen}=await params;
 if(!["dashboard","oportunidades","favoritos","empresas","alertas","notificacoes","analises","historico","configuracoes","admin","busca","relatorios"].includes(screen[0]))notFound();
 if(screen[0]==="admin")await requireAdmin();
 return <Workspace screen={screen}/>;
}
