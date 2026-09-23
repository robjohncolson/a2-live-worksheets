import json, os, time
BASE="https://lynnschools.schoology.com"
TOT=json.load(open(os.environ["TEMP"]+"/a2/totals.json"))
def key(vk,k,code,text=None):
    d={"type":"keyDown","key":k,"code":code,"windowsVirtualKeyCode":vk,"nativeVirtualKeyCode":vk}
    if text is not None: d["text"]=text; d["unmodifiedText"]=text
    cdp("Input.dispatchKeyEvent",**d)
    cdp("Input.dispatchKeyEvent",type="keyUp",key=k,code=code,windowsVirtualKeyCode=vk,nativeVirtualKeyCode=vk)
def enter_section(sec,cid,aid):
    goto(f"{BASE}/course/{cid}/grades"); wait_for_load()
    for _ in range(40):
        wait(0.5)
        if js("""[...document.querySelectorAll('[id^="grader-grid-cell-"]')].some(e=>/, Bonus(,|$)/.test(e.getAttribute('aria-label')||''))"""): break
    wait(2)
    aid=js("""([...document.querySelectorAll('[id^="grader-grid-cell-"]')].find(e=>/, Bonus(,|$)/.test(e.getAttribute('aria-label')||''))||{id:''}).id.split('-')[3]""")
    print(sec,"Bonus column index",aid)
    cdp("Page.bringToFront"); cdp("Emulation.setFocusEmulationEnabled",enabled=True)
    n=js(f"""document.querySelectorAll('[id^="grader-grid-cell-{aid}-"]').length""")
    done=0
    for row in range(n):
        sel=f"#grader-grid-cell-{aid}-{row}"; isel=sel+" input.grader-edit-input"
        aria=(js(f"document.querySelector({json.dumps(sel)}).getAttribute('aria-label')") or "").replace("&#039;","'")
        name=next((s for s in TOT[sec] if aria.startswith(s.split(', ')[1]+' '+s.split(', ')[0]+',')),None)
        if name is None: print(sec,row,"NO NAME MATCH",aria[:60]); continue
        val=TOT[sec][name]; vs=str(int(val)) if float(val).is_integer() else str(val)
        if f", Bonus, {vs} point" in aria: done+=1; continue
        ok=False
        for _ in range(6):
            js(f"(()=>{{const a=document.querySelector({json.dumps(isel)});if(a){{a.scrollIntoView({{block:'center',inline:'center'}});a.focus()}}}})()"); wait(0.35)
            if js(f"document.activeElement===document.querySelector({json.dumps(isel)})"): ok=True; break
            r=js(f"(()=>{{const a=document.querySelector({json.dumps(isel)});if(!a)return null;const r=a.getBoundingClientRect();return {{x:r.left+r.width/2,y:r.top+r.height/2}}}})()")
            if r: click(int(r["x"]),int(r["y"])); wait(0.45)
            if js(f"document.activeElement===document.querySelector({json.dumps(isel)})"): ok=True; break
        if not ok: print(sec,row,name,"FOCUS FAILED"); continue
        ex=js(f"document.querySelector({json.dumps(isel)}).value") or ""
        for _ in range(len(ex)+1): key(8,"Backspace","Backspace")
        for ch in vs: key({".":190}.get(ch,48+int(ch) if ch.isdigit() else 0),ch,"Period" if ch=="." else "Digit"+ch,text=ch)
        wait(0.3); key(13,"Enter","Enter",text="\r"); wait(2)
        good=False
        for _ in range(6):
            a2=(js(f"document.querySelector({json.dumps(sel)}).getAttribute('aria-label')") or "").replace("&#039;","'")
            if f", Bonus, {vs} point" in a2: good=True; break
            wait(0.5)
        print(sec,row,name,vs,"OK" if good else "NOT PERSISTED: "+a2[:80]); done+=good
    print(sec,"entered/verified",done,"of",n)
