import { readFileSync, writeFileSync } from "node:fs";
const file = "D:/01_Guiyuan1111/GitHub/slbhr/Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js";
const src = readFileSync(file, "latin1");
const jobs = [
  [1714400,1723100,"d01-movingplatform"],
  [1691650,1696340,"d02-lever"],
  [1696150,1699340,"d03-lightpusher"],
  [1744540,1748300,"d04-pusher"],
  [1661360,1662760,"d05-boxeddevice"],
  [1662570,1664750,"d06-ball"],
  [1671570,1677960,"d07-boxfamily"],
  [1677780,1680770,"d08-diamond"],
  [1680610,1684310,"d09-door"],
  [1684160,1688460,"d10-hanging"],
  [1737240,1744700,"d11-pulley"],
  [1748110,1752050,"d12-roman"],
  [1772560,1780670,"d13-wind"],
  [1780520,1783180,"d14-window"],
  [1654950,1661470,"d15-devicebase"],
  [1876980,1881670,"d16-mechmanager"],
  [1836300,1838600,"d17-navies"],
  [1912000,1914430,"d18-clock"],
  [1927450,1955670,"d19-level"],
  [44300,46200,"d20-early"],
  [1869500,1874300,"d21-charupdate"],
  [1863600,1864300,"d22-charproto"],
  [1857480,1860600,"d24-charfixtures"],
  [1862400,1864400,"d25-charliquid"],
  [1866500,1869000,"d26-charfriction"],
  [1917769,1925715,"d23-endmenus"],
];
const OUT="D:/01_Guiyuan1111/GitHub/slbhr/gyのFW/TEMP/extract-c/";
for(const [s,e,name] of jobs){
  const seg = src.substring(s,e);
  const lines = seg.split("\n");
  let off = s;
  let out = "";
  for(const ln of lines){
    out += "@"+off+"| "+ln+"\n";
    off += ln.length+1;
  }
  writeFileSync(OUT+name+".txt", out, "utf8");
  console.log(name, s+"-"+e, (e-s)+"B", lines.length+" lines");
}
