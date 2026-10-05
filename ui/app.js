(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const frame = $("#phone-frame");
  const anniversary = new Date();
  anniversary.setFullYear(anniversary.getFullYear() + 1);
  const warrantyExpiry = `${anniversary.getFullYear()}-${String(anniversary.getMonth()+1).padStart(2,"0")}-${String(anniversary.getDate()).padStart(2,"0")}`;
  const base = {
    name:"iPhone",iosVersion:"27.0",iosInstalledDate:"2026-09-17",
    modelName:"iPhone 16 Pro Max",modelNumber:"XXXXXXCH/A",serial:"XXXXXXXXXX",warrantyStatus:"limited",warrantyExpiry,
    songs:"0",videos:"589",photos:"1,763",apps:"113",capacity:"256 GB",available:"37.45 GB",
    modem:"3.02.02",carrierNetwork:"中国移动",carrierVersion:"中国移动 72.0.1",carrierLock:"无 SIM 卡限制"
  };
  let bridge = null;
  let toastTimer;
  const bytes = (count) => { const result=new Uint8Array(count);crypto.getRandomValues(result);return result; };
  const digits = (count) => [...bytes(count)].map((byte) => String(byte%10)).join("");
  function mac() {
    const values=bytes(6);values[0]=(values[0]|2)&254;
    return [...values].map((byte)=>byte.toString(16).padStart(2,"0").toUpperCase()).join(":");
  }
  function checkDigit(body) {
    let sum=0;
    for(let index=body.length-1;index>=0;index--){
      let number=Number(body[index]);
      if((body.length-1-index)%2===0){number*=2;if(number>9)number-=9;}
      sum+=number;
    }
    return String((10-sum%10)%10);
  }
  function imei() {
    const body="35"+digits(12);
    return body+checkDigit(body);
  }
  function iccid() {
    const body="898600"+digits(13);
    return body+checkDigit(body);
  }
  function identifiers() {
    return {wifi:mac(),bluetooth:mac(),imei:imei(),imei2:imei(),iccid:iccid(),seid:[...bytes(16)].map((byte)=>byte.toString(16).padStart(2,"0").toUpperCase()).join("")};
  }
  const firstIdentifiers=identifiers();
  let state={...base,...firstIdentifiers};

  function syncFields() {
    $$("[data-field]").forEach((input)=>{if(document.activeElement!==input)input.value=state[input.dataset.field]??"";});
    $("#warranty-expiry-field").hidden = state.warrantyStatus !== "limited";
  }
  function syncPhone() {
    if(frame.contentWindow?.AboutPhone)frame.contentWindow.AboutPhone.applyState(state);
    syncFields();
  }
  function resizePhone() {
    const stage=$("#device-stage");
    const availableHeight=Math.max(400,stage.clientHeight-56);
    const availableWidth=Math.max(300,stage.clientWidth-170);
    const factor=Math.max(.18,Math.min(.28,availableHeight/3000,availableWidth/1470));
    const screenWidth=1320*factor,screenHeight=2868*factor;
    const crop=$("#phone-screen-crop");
    const device=$("#phone-device");
    device.style.width=`${1470*factor}px`;
    device.style.height=`${3000*factor}px`;
    crop.style.left=`${75*factor}px`;
    crop.style.top=`${66*factor}px`;
    crop.style.width=`${screenWidth}px`;
    crop.style.height=`${screenHeight}px`;
    crop.style.borderRadius=`${200*factor}px`;
    frame.style.transform=`scale(${screenWidth/430},${screenHeight/935})`;
    window.LiquidGlass?.scheduleCapture(330);
  }
  function showToast(message) {
    $("#toast-text").textContent=message;
    $("#toast").classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>$("#toast").classList.remove("visible"),2600);
  }
  function randomizeIdentifiers() {
    Object.assign(state,identifiers());
    syncPhone();
    showToast("已在本地重新生成设备标识");
    window.LiquidGlass?.scheduleCapture(450);
  }
  function resetDefaults() {
    state={...base,...firstIdentifiers};
    syncPhone();
    showToast("已恢复默认示例");
    window.LiquidGlass?.scheduleCapture(450);
  }
  function getExportPayload() {
    const view=frame.contentWindow?.AboutPhone?.getViewState()||{page:"about",scroll:0,modelRevealed:false};
    return JSON.stringify({data:state,...view});
  }
  function capture() {
    if(!bridge){showToast("截图功能正在准备中");return;}
    bridge.exportPhone(getExportPayload());
  }
  $$("[data-field]").forEach((input)=>input.addEventListener(input.tagName === "SELECT" ? "change" : "input",()=>{
    state[input.dataset.field]=input.value;
    if(frame.contentWindow?.AboutPhone)frame.contentWindow.AboutPhone.applyState(state);
    syncFields();
    window.LiquidGlass?.scheduleCapture(600);
  }));
  frame.addEventListener("load",()=>{syncPhone();frame.contentWindow.document.querySelector("#phone-scroll").scrollTop=0;resizePhone();});
  window.addEventListener("message",(event)=>{
    if(event.source!==frame.contentWindow || event.data?.source!=="about-phone")return;
    if(event.data.type==="glass-backdrop"){
      bridge?.requestPhoneBackdrop(getExportPayload());
      window.LiquidGlass?.scheduleCapture(260);
    }
    if(event.data.type==="copy")bridge?.copyText(String(event.data.value||""));
    if(event.data.type==="field" && event.data.key==="name"){
      state.name=String(event.data.value||"");
      const input=$("[data-field='name']");if(input)input.value=state.name;
    }
  });
  $("#capture-button").addEventListener("click",capture);
  $("#header-reset").addEventListener("click",resetDefaults);
  $("#regenerate-inline").addEventListener("click",randomizeIdentifiers);
  const developerDialog=$("#developer-dialog");
  $("#developer-info").addEventListener("click",()=>{developerDialog.showModal();$("#developer-dialog-title").focus({preventScroll:true});});
  $("#developer-close").addEventListener("click",()=>developerDialog.close());
  developerDialog.addEventListener("click",(event)=>{
    if(event.target!==developerDialog)return;
    const bounds=developerDialog.getBoundingClientRect();
    if(event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom)developerDialog.close();
  });
  window.addEventListener("resize",resizePhone);
  const stageObserver=new ResizeObserver(resizePhone);stageObserver.observe($("#device-stage"));

  // The title bar doubles as the drag handle for this frameless window.
  $$(".drag-zone").forEach((area)=>area.addEventListener("pointerdown",(event)=>{
    if(event.target.closest("button, input, a"))return;
    bridge?.startDrag(event.screenX,event.screenY);
    area.setPointerCapture(event.pointerId);
  }));
  window.addEventListener("pointermove",(event)=>{if(event.buttons===1)bridge?.dragTo(event.screenX,event.screenY);});
  window.addEventListener("pointerup",()=>{bridge?.endDrag();frame.contentWindow?.PhoneGlass?.cancelPress();});
  window.addEventListener("mouseup",()=>frame.contentWindow?.PhoneGlass?.cancelPress());
  $("#window-close").addEventListener("click",()=>bridge?.close());
  $("#window-minimize").addEventListener("click",()=>bridge?.minimize());
  $("#window-maximize").addEventListener("click",()=>bridge?.maximize());

  window.AboutStudio={getExportPayload,showToast,getState:()=>({...state})};
  window.LiquidGlass.init();
  if(window.qt?.webChannelTransport){new QWebChannel(qt.webChannelTransport,(channel)=>{bridge=channel.objects.windowBridge;window.LiquidGlass.setBridge(bridge);frame.contentWindow?.PhoneGlass?.requestBackdrop(100);});}
  syncFields();
  resizePhone();
})();
