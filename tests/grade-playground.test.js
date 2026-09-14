// @vitest-environment node
﻿import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const html=readFileSync(new URL('../start-here.html',import.meta.url),'utf8');
it('district playground weights all three categories and shows the remaining-work ceiling',()=>{
 const dom=new JSDOM(html,{runScripts:'dangerously'});
 const d=dom.window.document;
 for(const [key,value] of [['assessments',100],['assignments',50],['engagement',0]]) {
  const slider=d.getElementById(key);slider.value=value;slider.dispatchEvent(new dom.window.Event('input'));
 }
 expect(d.getElementById('district-grade').textContent).toBe('70.0%');
 expect(d.getElementById('district-ceiling').textContent).toBe('85.0%');
 expect(d.querySelectorAll('input[type=range]').length).toBe(3);
 dom.window.close();
});
