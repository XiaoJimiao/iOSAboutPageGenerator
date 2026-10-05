(() => {
  const $ = (selector) => document.querySelector(selector);
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const anniversary = new Date();
  anniversary.setFullYear(anniversary.getFullYear() + 1);
  const warrantyExpiry = `${anniversary.getFullYear()}-${String(anniversary.getMonth()+1).padStart(2,"0")}-${String(anniversary.getDate()).padStart(2,"0")}`;
  const defaults = {
    name:"iPhone",iosVersion:"27.0",iosInstalledDate:"2026-09-17",
    modelName:"iPhone 16 Pro Max",modelNumber:"XXXXXXCH/A",serial:"XXXXXXXXXX",warrantyStatus:"limited",warrantyExpiry,
    songs:"0",videos:"589",photos:"1,763",apps:"113",capacity:"256 GB",available:"37.45 GB",
    wifi:"XX:XX:XX:XX:XX:XX",bluetooth:"XX:XX:XX:XX:XX:XX",modem:"3.02.02",
    carrierNetwork:"中国移动",carrierVersion:"中国移动 72.0.1",carrierLock:"无 SIM 卡限制",
    imei:"XXXXXXXXXXXXXXX",imei2:"XXXXXXXXXXXXXXX",iccid:"XXXXXXXXXXXXXXXXXXXX",seid:"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  };
  let data = {...defaults};
  let page = "about";
  let modelRevealed = false;
  let toastTimer;
  let appIndicatorVisible = true;
  let appIndicatorTimer;
  let scrollIndicatorTimer;
  let exportMode = false;

  function setAppIndicatorVisible(visible) {
    if (appIndicatorVisible === visible) return;
    appIndicatorVisible = visible;
    $("#app-indicator").classList.toggle("idle", !visible);
    if (!exportMode && window.parent !== window) {
      window.parent.postMessage({source:"about-phone",type:"glass-backdrop"}, "*");
    }
  }
  function markActivity() {
    if (exportMode) return;
    setAppIndicatorVisible(true);
    clearTimeout(appIndicatorTimer);
    appIndicatorTimer = setTimeout(() => setAppIndicatorVisible(false), 5000);
  }
  function updatePhoneScrollbar(show=false) {
    const scroll=$("#phone-scroll"), track=$("#phone-scrollbar"), thumb=track.firstElementChild;
    const maxScroll=scroll.scrollHeight-scroll.clientHeight;
    if (maxScroll <= 0) { track.classList.remove("visible"); return; }
    const height=Math.min(track.clientHeight,Math.max(28,track.clientHeight*scroll.clientHeight/scroll.scrollHeight));
    thumb.style.height=`${height}px`;
    thumb.style.transform=`translateY(${scroll.scrollTop/maxScroll*(track.clientHeight-height)}px)`;
    if (!show || exportMode) return;
    track.classList.add("visible");
    clearTimeout(scrollIndicatorTimer);
    scrollIndicatorTimer=setTimeout(()=>track.classList.remove("visible"),1400);
  }

  function row(label, value, action="copy", arrow=false, extraClass="") {
    return `<button class="ios-row action ${extraClass}" data-action="${escape(action)}" data-value="${escape(value)}"><span class="row-label">${escape(label)}</span><span class="row-trailing"><span class="row-value">${escape(value)}</span>${arrow?'<i class="chevron" aria-hidden="true"></i>':''}</span></button>`;
  }
  function group(rows, extra="") { return `<section class="ios-group ${extra}">${rows.join("")}</section>`; }
  function sectionHeading(title) { return `<h2 class="ios-section-heading">${escape(title)}</h2>`; }
  function formatImei(value) {
    const number=String(value??"").replace(/\s/g,"");
    return /^\d{15}$/.test(number) ? number.replace(/^(\d{2})(\d{6})(\d{6})(\d)$/, "$1 $2 $3 $4") : String(value??"");
  }
  function formatWarrantyExpiry(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    return match ? `${match[1]}/${match[2]}/${match[3]}` : "";
  }
  function appleCareDaysRemaining(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return -1;
    const activation = new Date(Date.UTC(Number(match[1]), Number(match[2])-1, Number(match[3])));
    activation.setUTCFullYear(activation.getUTCFullYear()-1);
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return 15 - Math.floor((todayUtc - activation.getTime()) / 86400000);
  }
  function warrantyMarkup() {
    if (data.warrantyStatus !== "limited") return group([row("保障不适用","","warranty",true)]);
    const warrantyRow = row("有限保修",`到期: ${formatWarrantyExpiry(data.warrantyExpiry)}`,"warranty",true);
    const days = appleCareDaysRemaining(data.warrantyExpiry);
    if (days < 0) return group([warrantyRow]);
    return group([warrantyRow,
      row("添加 AppleCare+ 服务计划保障","","applecare",false,"applecare-link")
    ],"warranty-group")+`<p class="warranty-note">还剩 ${days} 天时间可以为意外损坏添加保障。</p>`;
  }
  function aboutMarkup() {
    return group([
      row("名称",data.name,"name",true),row("iOS 版本",data.iosVersion,"version",true),
      row("型号名称",data.modelName),row("型号",modelRevealed?"A3296":data.modelNumber,"model"),
      row("序列号",data.serial)
    ])+warrantyMarkup()+group([
      row("歌曲",data.songs),row("视频",data.videos),row("照片",data.photos),
      row("应用程序",data.apps),row("总容量",data.capacity),row("可用容量",data.available)
    ])+group([
      row("无线局域网地址",data.wifi),row("蓝牙",data.bluetooth),row("调制解调器固件",data.modem),
      row("SEID","","seid",true),row("运营商锁",data.carrierLock)
    ])+sectionHeading("正面 SIM 卡")+group([
      row("网络",data.carrierNetwork),row("运营商",data.carrierVersion),
      row("IMEI",formatImei(data.imei)),row("ICCID",data.iccid)
    ])+sectionHeading("背面 SIM 卡")+group([
      row("IMEI2",formatImei(data.imei2))
    ])+group([row("证书信任设置","","certificate",true)]);
  }
  function versionMarkup() {
    const major = (String(data.iosVersion).match(/^\d+/) || ["27"])[0];
    const installed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.iosInstalledDate || "");
    const installedText = installed ? `已安装 ${Number(installed[1])} 年 ${Number(installed[2])} 月 ${Number(installed[3])} 日` : "";
    return `<h2 class="ios-version-heading">iOS 版本</h2>
      <section class="ios-version-card" id="ios-version-card">
        <div class="ios-version-card-header">
          <h3 class="ios-version-name">iOS ${escape(data.iosVersion)}</h3>
          <p class="ios-version-installed">${installedText}</p>
        </div>
        <div class="ios-version-description-shell">
          <div class="ios-version-description" id="ios-version-scroll" tabindex="0">
            <p>这是 AboutGenerator 的版本信息演示页面。版本号和安装日期由用户填写，下面的文字用于展示长内容的排版与滚动效果，不对应任何厂商发布的系统更新。</p>
            <p>预览中的名称、型号、容量和设备标识均为示例数据。你可以在窗口右侧修改这些字段，并在保存图片前检查画面。应用会在本机生成随机设备标识，不会从真实手机读取信息。</p>
            <p>此演示页面保留了固定标题、内容滚动和细滚动条等交互。导出图片时，程序只截取预览框内的画面。为了保护隐私，请勿在公开图片中填写真实序列号或通信标识。</p>
          </div>
          <div class="ios-version-scrollbar" id="ios-version-scrollbar" aria-label="滚动版本说明" role="scrollbar" aria-orientation="vertical"><span class="ios-version-scrollbar-thumb"></span></div>
        </div>
      </section>`;
  }
  function detailMarkup() {
    if (page === "name") return group(['<input class="edit-input" id="name-edit" aria-label="名称" maxlength="32" value="'+escape(data.name)+'">'],"detail");
    if (page === "version") return versionMarkup();
    if (page === "seid") return `<section class="ios-group identifier-detail"><div class="identifier-detail-label">SEID</div><div class="identifier-detail-value">${escape(data.seid)}</div></section>`;
    if (page === "certificate") return sectionHeading("启用对根证书的完全信任")+group([row("已安装的根证书","无")]);
    if (page === "warranty") {
      const covered = data.warrantyStatus === "limited";
      return group(covered ? [row("保障状态","有限保修"),row("到期日期",formatWarrantyExpiry(data.warrantyExpiry))] : [row("保障状态","不适用")],"detail")+
        (covered ? "" : '<div class="detail-copy">此设备目前没有适用的保障信息。</div>');
    }
    if (page === "applecare") return group([row("AppleCare+ 服务计划保障","可添加")],"detail")+
      `<div class="detail-copy">还剩 ${appleCareDaysRemaining(data.warrantyExpiry)} 天时间可以为意外损坏添加保障。</div>`;
    return aboutMarkup();
  }
  function render(keepScroll=false) {
    if (page === "applecare" && (data.warrantyStatus !== "limited" || appleCareDaysRemaining(data.warrantyExpiry) < 0)) page = "about";
    const scroll = $("#phone-scroll");
    const old = keepScroll ? scroll.scrollTop : 0;
    const oldVersionScroll = keepScroll ? $("#ios-version-scroll")?.scrollTop || 0 : 0;
    $("#page-title").innerHTML = {
      about: "关于本机",
      name: "名称",
      version: '<span class="nav-latin">iOS</span> 版本',
      applecare: '<span class="nav-latin">AppleCare+</span>',
      seid: '<span class="nav-latin">SEID</span>',
      certificate: "证书信任设置",
      warranty: "保障信息"
    }[page];
    $("#phone-content").classList.toggle("version-page", page === "version");
    $("#phone-content").innerHTML = page === "about" ? aboutMarkup() : detailMarkup();
    scroll.scrollTop = old;
    requestAnimationFrame(()=>updatePhoneScrollbar());
    const versionScroll = $("#ios-version-scroll");
    if (versionScroll) {
      versionScroll.scrollTop = oldVersionScroll;
      const scrollbar = $("#ios-version-scrollbar");
      const thumb = scrollbar.querySelector(".ios-version-scrollbar-thumb");
      const updateScrollbar = () => {
        const maxScroll = versionScroll.scrollHeight - versionScroll.clientHeight;
        const height = Math.min(scrollbar.clientHeight, Math.max(28, scrollbar.clientHeight * versionScroll.clientHeight / versionScroll.scrollHeight));
        const travel = scrollbar.clientHeight - height;
        thumb.style.height = `${height}px`;
        thumb.style.transform = `translateY(${maxScroll > 0 ? versionScroll.scrollTop / maxScroll * travel : 0}px)`;
        scrollbar.style.display = maxScroll > 0 ? "block" : "none";
        scrollbar.setAttribute("aria-valuenow", String(Math.round(versionScroll.scrollTop)));
        scrollbar.setAttribute("aria-valuemax", String(Math.round(maxScroll)));
      };
      requestAnimationFrame(updateScrollbar);
      let thumbOffset = 0;
      const moveThumb = (event) => {
        const bounds = scrollbar.getBoundingClientRect();
        const travel = scrollbar.clientHeight - thumb.offsetHeight;
        const top = Math.max(0, Math.min(travel, event.clientY - bounds.top - thumbOffset));
        versionScroll.scrollTop = travel > 0 ? top / travel * (versionScroll.scrollHeight - versionScroll.clientHeight) : 0;
      };
      scrollbar.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        const thumbTop = thumb.getBoundingClientRect().top;
        thumbOffset = event.clientY >= thumbTop && event.clientY <= thumbTop + thumb.offsetHeight ? event.clientY - thumbTop : thumb.offsetHeight / 2;
        scrollbar.setPointerCapture(event.pointerId);
        moveThumb(event);
        markActivity();
      });
      scrollbar.addEventListener("pointermove", (event) => {
        event.stopPropagation();
        if (scrollbar.hasPointerCapture(event.pointerId)) moveThumb(event);
      });
      versionScroll.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        versionDragY = event.clientY;
        versionDragScroll = versionScroll.scrollTop;
        markActivity();
      });
      versionScroll.addEventListener("pointermove", (event) => {
        event.stopPropagation();
        if (versionDragY !== null && event.buttons === 1) versionScroll.scrollTop = versionDragScroll - (event.clientY-versionDragY);
      });
      versionScroll.addEventListener("scroll", () => { updateScrollbar(); markActivity(); window.PhoneGlass?.requestBackdrop(180); }, {passive:true});
    }
    $("#name-edit")?.addEventListener("input", (event) => {
      data.name = event.target.value;
      window.parent?.postMessage({source:"about-phone",type:"field",key:"name",value:data.name},"*");
    });
  }
  function toast(message) {
    const element = $("#phone-toast");
    element.textContent = message;
    element.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("visible"),1400);
  }
  $("#phone-content").addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (["name","version","warranty","applecare","seid","certificate"].includes(action)) { page=action; render(); return; }
    if (action === "model") { modelRevealed=!modelRevealed; render(true); return; }
    const value = target.dataset.value;
    if (value) {
      window.parent?.postMessage({source:"about-phone",type:"copy",value},"*");
      toast("已拷贝");
    }
  });
  const back = $("#phone-back");
  back.addEventListener("pointerdown", (event) => { back.classList.add("pressed"); back.setPointerCapture(event.pointerId); });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) back.addEventListener(name, () => back.classList.remove("pressed"));
  back.addEventListener("click", () => {
    if (page !== "about") { page="about"; render(); }
    else toast("设置");
  });
  let downY=null, downScroll=0, versionDragY=null, versionDragScroll=0;
  $("#phone-scroll").addEventListener("pointerdown",(event)=>{downY=event.clientY;downScroll=event.currentTarget.scrollTop;});
  $("#phone-scroll").addEventListener("pointermove",(event)=>{
    if(downY===null || event.buttons!==1) return;
    const delta=event.clientY-downY;
    if(Math.abs(delta)>7)event.currentTarget.scrollTop=downScroll-delta;
  });
  window.addEventListener("pointerup",()=>{downY=null;versionDragY=null;});
  const syncScrollAppearance = () => $("#ios-screen").classList.toggle("scrolled", $("#phone-scroll").scrollTop > 2);
  $("#phone-scroll").addEventListener("scroll", () => {
    syncScrollAppearance();
    updatePhoneScrollbar(true);
    markActivity();
  }, {passive:true});
  for (const type of ["pointerdown", "wheel", "keydown", "touchstart"]) {
    window.addEventListener(type, markActivity, {passive:true});
  }
  window.addEventListener("pointermove", (event) => {
    if (event.buttons) markActivity();
  }, {passive:true});
  window.AboutPhone = {
    applyState(next) { data={...defaults,...next}; render(true); markActivity(); },
    applyExportState(payload) {
      exportMode = true;
      clearTimeout(appIndicatorTimer);
      setAppIndicatorVisible(payload.appIndicatorVisible !== false);
      data={...defaults,...payload.data};page=payload.page||"about";modelRevealed=!!payload.modelRevealed;
      $("#phone-toast").classList.remove("visible");render();
      requestAnimationFrame(()=>{
        $("#phone-scroll").scrollTop=Number(payload.scroll)||0;
        if ($("#ios-version-scroll")) $("#ios-version-scroll").scrollTop=Number(payload.versionScroll)||0;
        updatePhoneScrollbar();
        $("#phone-scrollbar").classList.toggle("visible",payload.scrollbarVisible===true);
      });
    },
    getViewState() { return {page,scroll:$("#phone-scroll").scrollTop,versionScroll:$("#ios-version-scroll")?.scrollTop||0,modelRevealed,appIndicatorVisible,scrollbarVisible:$("#phone-scrollbar").classList.contains("visible")}; }
  };
  render();
  function refreshAtMidnight() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
    setTimeout(() => { render(true); refreshAtMidnight(); }, tomorrow - now);
  }
  refreshAtMidnight();
  markActivity();
  document.fonts.ready.then(() => {
    window.PhoneGlass?.requestBackdrop(90);
  });
})();
