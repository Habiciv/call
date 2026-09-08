export function MentionText({text,members}:{text:string;members:any[]}){
 return <>{text.split(/(@\[[a-f0-9]{32}\])/g).map((part,i)=>{const match=/^@\[([a-f0-9]{32})\]$/.exec(part);return match?<mark className="mention" key={i}>@{members.find(m=>m.userKey===match[1])?.name||'membro'}</mark>:part})}</>;
}
