// Next/proxies may decode the official ID's encoded slash before splitting a catch-all route.
export function opportunityRoute(parts:string[]){
 const id=(parts[0]??"").replace(/%2f/ig,"/");
 if(/^\d{14}-\d-\d+$/.test(id)&&/^\d{4}$/.test(parts[1]??""))return {id:id+"/"+parts[1],action:parts[2]};
 return {id,action:parts[1]};
}
