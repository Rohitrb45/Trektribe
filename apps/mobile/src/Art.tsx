import React from 'react';
import Svg, { Path, Rect, Circle, Defs, LinearGradient, Stop, Polyline, Ellipse } from 'react-native-svg';
export function MountainArt({ color = '#829d8d', variant = 0 }: { color?: string; variant?: number }) {
  return <Svg width="100%" height="100%" viewBox="0 0 800 420" preserveAspectRatio="xMidYMid slice">
    <Defs><LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#dbe2d5"/><Stop offset="1" stopColor="#f6e9ce"/></LinearGradient></Defs>
    <Rect width="800" height="420" fill="url(#sky)"/>
    <Circle cx={variant%2 ? 580 : 630} cy="88" r="38" fill="#f6f0d9"/>
    <Path d="M0 270 L100 175 168 215 320 66 412 157 500 101 661 238 750 176 800 225V420H0Z" fill="#aebcaf"/>
    <Path d="M168 215L320 66 412 157 374 139 350 153 317 114 285 151 263 146Z" fill="#eef0e6"/>
    <Path d="M0 322 L110 252 180 279 325 194 438 257 538 150 666 271 800 216V420H0Z" fill={color}/>
    <Path d="M470 216L538 150 604 212 566 195 550 202 532 178 514 209Z" fill="#dce2d3"/>
    <Path d="M0 366 Q130 263 282 334 T520 303 Q640 254 800 325V420H0Z" fill="#34564a"/>
    <Path d="M0 414 Q170 322 334 380 T800 351V420H0Z" fill="#203e35"/>
    <Path d="M438 420 Q477 383 441 369 T459 329 Q465 316 459 313" stroke="#c5b990" strokeWidth="7" fill="none"/>
    {[32,74,119,675,720,766].map((x,i)=><Path key={x} d={`M${x} ${330-i%3*13}l-18 43h11l-15 28h44l-15-28h11Z`} fill="#193c31"/>)}
    {variant===3 && <Ellipse cx="400" cy="366" rx="165" ry="18" fill="#9fbdb1" opacity="0.7"/>}
  </Svg>;
}
export function RouteArt({ points, color = '#26694e' }: { points: [number,number][]; color?: string }) {
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const p=points.map(([x,y])=>`${50+(x-minX)/(maxX-minX||1)*300},${195-(y-minY)/(maxY-minY||1)*140}`).join(' ');
  const first=p.split(' ')[0].split(','); const last=p.split(' ').at(-1)!.split(',');
  return <Svg width="100%" height="100%" viewBox="0 0 400 250">
    <Rect width="400" height="250" rx="16" fill="#e8ede1"/>
    {[0,1,2,3,4,5,6].map(i=><Path key={i} d={`M${-50+i*22} 260 Q${-70+i*30} ${50+i*4} ${170+i*25} ${15+i*18} T460 ${100+i*20}`} fill="none" stroke="#cdd8c7" strokeWidth="1.5"/>)}
    <Polyline points={p} stroke="#fff" strokeWidth="8" strokeLinejoin="round" fill="none"/>
    <Polyline points={p} stroke={color} strokeWidth="4" strokeLinejoin="round" fill="none"/>
    <Circle cx={first[0]} cy={first[1]} r="7" fill="white" stroke={color} strokeWidth="3"/>
    <Circle cx={last[0]} cy={last[1]} r="7" fill={color} stroke="white" strokeWidth="3"/>
  </Svg>;
}
export function Icon({ name, color='#214e3d', size=22 }: { name: string; color?: string; size?: number }) {
  const paths: Record<string,string> = {
    explore:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M16 8l-3 5-5 3 3-5Z',
    community:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-3.9',
    trips:'M5 5h14v16H5ZM8 3v4m8-4v4M5 10h14',
    profile:'M20 21a8 8 0 0 0-16 0M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6',
    save:'M6 3h12v18l-6-4-6 4Z',
    heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    arrow:'M4 12h16m-6-6 6 6-6 6',
    close:'m6 6 12 12M6 18 18 6',
    mountain:'M2 20 9 5l4 7 3-5 6 13ZM6 12l3 2 3-3',
    comment:'M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z',
    check:'m5 12 4 4L19 6',
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d={paths[name]||paths.mountain} stroke={color} strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}
