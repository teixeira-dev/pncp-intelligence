import nodemailer from "nodemailer";
export async function sendMail(to:string,subject:string,text:string,id?:string){
 if(!process.env.SMTP_HOST||!process.env.MAIL_FROM)throw new Error("SMTP_NOT_CONFIGURED");
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:process.env.SMTP_PORT==="465",requireTLS:process.env.SMTP_PORT!=="465",auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
 await transport.sendMail({from:process.env.MAIL_FROM,to,subject,text,...(id?{messageId:"<"+id+"@pncp-intelligence>"}:{})});
}
