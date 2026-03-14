function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRouletteDashboardPage({ operatorName = "" } = {}) {
  return `
    <html lang="ko">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>이벤트 룰렛 컨트롤</title>
        <style>
          :root{
            --bg:#0b0b0f;
            --panel:#15171d;
            --panel-2:#111318;
            --line:rgba(255,255,255,0.08);
            --line-strong:rgba(255,255,255,0.14);
            --text:#ffffff;
            --muted:#a6adbb;
            --primary:#ff4d6d;
            --primary-2:#ff6b88;
            --danger:#ff5c73;
            --warning:#ffd166;
            --success:#4ade80;
            --info:#60a5fa;
            --shadow:0 18px 50px rgba(0,0,0,0.32);
          }
          *{box-sizing:border-box;}
          body{
            margin:0;
            background:radial-gradient(circle at top, rgba(255,77,109,0.08), transparent 24%), var(--bg);
            color:var(--text);
            font-family:Arial,sans-serif;
          }
          .page{
            max-width:1180px;
            margin:0 auto;
            padding:28px 24px 56px;
          }
          .topbar{
            display:flex;
            justify-content:space-between;
            align-items:flex-start;
            gap:16px;
            margin-bottom:20px;
          }
          .topbar h1{
            margin:0;
            font-size:34px;
            line-height:1.15;
          }
          .topbar .desc{
            margin-top:8px;
            color:var(--muted);
            font-size:14px;
          }
          .grid{
            display:grid;
            grid-template-columns:1.05fr 0.95fr;
            gap:20px;
          }
          .card{
            background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)), var(--panel);
            border:1px solid var(--line);
            border-radius:22px;
            padding:22px;
            box-shadow:var(--shadow);
          }
          .card h2{
            margin:0 0 16px;
            font-size:24px;
          }
          .section-title{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            margin-bottom:16px;
          }
          .section-title .subtext{
            color:var(--muted);
            font-size:13px;
          }
          .label{
            display:block;
            margin-bottom:8px;
            font-size:14px;
            font-weight:700;
            color:#dce1eb;
          }
          input, textarea{
            width:100%;
            border:none;
            outline:none;
            border-radius:14px;
            padding:14px 16px;
            background:var(--panel-2);
            color:var(--text);
            border:1px solid var(--line);
            font-size:15px;
            margin-bottom:12px;
          }
          textarea{min-height:90px;resize:vertical;}
          .hint{
            color:var(--muted);
            font-size:13px;
            line-height:1.7;
          }
          .button-row,
          .action-grid{
            display:flex;
            flex-wrap:wrap;
            gap:10px;
          }
          .action-grid{
            display:grid;
            grid-template-columns:repeat(3,minmax(0,1fr));
          }
          button{
            border:none;
            border-radius:16px;
            padding:14px 16px;
            font-size:15px;
            font-weight:800;
            cursor:pointer;
            color:#fff;
            background:linear-gradient(180deg, var(--primary-2), var(--primary));
            transition:transform 120ms ease, opacity 120ms ease, box-shadow 120ms ease;
            box-shadow:0 14px 28px rgba(255,77,109,0.22);
          }
          button:hover:not(:disabled){transform:translateY(-1px);}
          button:disabled{
            opacity:0.45;
            cursor:not-allowed;
            box-shadow:none;
          }
          button.secondary{
            background:#272b34;
            box-shadow:none;
          }
          button.danger{
            background:linear-gradient(180deg, #ff6b7f, #ef4444);
            box-shadow:0 14px 28px rgba(239,68,68,0.22);
          }
          .status-badge{
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-width:94px;
            padding:8px 12px;
            border-radius:999px;
            font-size:13px;
            font-weight:900;
            letter-spacing:0.02em;
            border:1px solid transparent;
          }
          .status-ready{background:rgba(96,165,250,0.14);color:#bfdbfe;border-color:rgba(96,165,250,0.28);}
          .status-spinning{background:rgba(255,209,102,0.14);color:#ffe5a3;border-color:rgba(255,209,102,0.28);}
          .status-stopping{background:rgba(251,146,60,0.14);color:#fdba74;border-color:rgba(251,146,60,0.28);}
          .status-finished{background:rgba(74,222,128,0.14);color:#bbf7d0;border-color:rgba(74,222,128,0.28);}
          .status-closed{background:rgba(255,255,255,0.10);color:#d1d5db;border-color:rgba(255,255,255,0.12);}
          .summary-grid{
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:12px;
            margin-top:8px;
          }
          .summary-item{
            background:var(--panel-2);
            border:1px solid var(--line);
            border-radius:16px;
            padding:14px 16px;
            min-height:86px;
          }
          .summary-item .k{
            color:var(--muted);
            font-size:12px;
            font-weight:700;
            margin-bottom:8px;
          }
          .summary-item .v{
            font-size:19px;
            font-weight:900;
            line-height:1.35;
            word-break:break-word;
          }
          .summary-item .v.small{font-size:15px;font-weight:700;}
          .winner-card{
            margin-top:14px;
            padding:18px 18px;
            border-radius:18px;
            border:1px solid rgba(255,209,102,0.24);
            background:linear-gradient(135deg, rgba(255,209,102,0.14), rgba(255,122,89,0.10));
          }
          .winner-card .k{
            color:#ffe7a0;
            font-size:13px;
            font-weight:900;
            margin-bottom:8px;
          }
          .winner-card .v{
            color:var(--warning);
            font-size:32px;
            font-weight:1000;
            line-height:1.2;
            word-break:keep-all;
          }
          .candidate-wrap{
            margin-top:18px;
            padding-top:18px;
            border-top:1px solid var(--line);
          }
          .candidate-head{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            margin-bottom:12px;
          }
          .candidate-head .title{
            font-size:18px;
            font-weight:900;
          }
          .candidate-meta{
            color:var(--muted);
            font-size:13px;
          }
          .candidate-list{
            margin:0;
            padding-left:22px;
            color:#e8edf7;
            line-height:1.9;
            font-size:15px;
          }
          .candidate-empty{
            padding:16px;
            border-radius:14px;
            background:var(--panel-2);
            border:1px dashed var(--line-strong);
            color:var(--muted);
            font-size:14px;
          }
          .share-box{
            margin-top:14px;
            padding:16px;
            border-radius:18px;
            background:var(--panel-2);
            border:1px solid var(--line);
          }
          .share-url{
            width:100%;
            border:none;
            outline:none;
            background:#0c0f14;
            color:#f5f7fb;
            border-radius:14px;
            padding:14px 16px;
            font-size:14px;
            font-family:monospace;
            border:1px solid var(--line);
            margin:0;
          }
          .share-help{
            margin-top:10px;
            color:var(--muted);
            font-size:13px;
            line-height:1.6;
          }
          .empty-state{
            padding:24px;
            border-radius:18px;
            background:var(--panel-2);
            border:1px dashed var(--line-strong);
            color:var(--muted);
            line-height:1.8;
          }
          .loading-note{
            margin-top:12px;
            color:var(--muted);
            font-size:13px;
          }
          @media (max-width: 960px){
            .grid{grid-template-columns:1fr;}
            .action-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
          }
          @media (max-width: 640px){
            .page{padding:20px 16px 44px;}
            .topbar{flex-direction:column;align-items:flex-start;}
            .summary-grid,
            .action-grid{grid-template-columns:1fr;}
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="topbar">
            <div>
              <h1>🎯 이벤트 룰렛 컨트롤</h1>
              <div class="desc">작업자: ${escapeHtml(operatorName || "dashboard")}</div>
            </div>
            <button class="secondary" type="button" onclick="location.href='/dashboard'">대시보드로 돌아가기</button>
          </div>

          <div class="grid">
            <div class="card">
              <div class="section-title">
                <div>
                  <h2>이벤트 생성</h2>
                  <div class="subtext">현재 등록된 채널 중 방송 중인 BJ만 후보로 포함됩니다.</div>
                </div>
              </div>

              <label class="label" for="titleInput">이벤트명</label>
              <input id="titleInput" type="text" placeholder="예) 3월 이벤트 룰렛" />

              <label class="label" for="sponsorInput">펀딩 담당자</label>
              <input id="sponsorInput" type="text" placeholder="예) 하리보" />

              <label class="label" for="prizeInput">상품 / 금액</label>
              <input id="prizeInput" type="text" placeholder="예) 5만 렉스" />

              <div class="button-row">
                <button id="createBtn" type="button">이벤트 생성</button>
              </div>
              <div class="loading-note" id="createHelp">닫힌 이벤트가 있거나 활성 이벤트가 없을 때만 새 이벤트를 만드는 흐름이 자연스럽습니다.</div>
            </div>

            <div class="card">
              <div class="section-title">
                <div>
                  <h2>운영 액션</h2>
                  <div class="subtext">상태에 맞는 버튼만 활성화됩니다.</div>
                </div>
                <span id="statusBadge" class="status-badge status-closed">이벤트 없음</span>
              </div>

              <div class="action-grid">
                <button id="refreshCandidatesBtn" class="secondary" type="button">후보 새로고침</button>
                <button id="shareBtn" class="secondary" type="button">공유 링크 만들기</button>
                <button id="copyShareBtn" class="secondary" type="button">링크 복사</button>
                <button id="startBtn" type="button">START</button>
                <button id="stopBtn" type="button">STOP</button>
                <button id="redrawBtn" class="secondary" type="button">다시뽑기</button>
                <button id="closeBtn" class="danger" type="button">종료</button>
              </div>

              <div class="share-box">
                <div class="label" style="margin-bottom:10px;">공유 링크</div>
                <input id="shareUrlInput" class="share-url" type="text" readonly value="아직 생성되지 않았습니다." />
                <div id="shareHelp" class="share-help">외부에서 열 수 있는 주소가 필요합니다. 로컬 주소(localhost)는 공유용으로 적합하지 않습니다.</div>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:20px;">
            <div class="section-title">
              <div>
                <h2>현재 이벤트 상태</h2>
                <div class="subtext">상태, 후보 스냅샷, 당첨자를 한 번에 확인합니다.</div>
              </div>
            </div>
            <div id="stateBox">불러오는 중...</div>
          </div>
        </div>

        <script>
          let currentEvent = null;
          let actionLocked = false;
          let lastShareUrl = "";

          const els = {
            titleInput: document.getElementById("titleInput"),
            sponsorInput: document.getElementById("sponsorInput"),
            prizeInput: document.getElementById("prizeInput"),
            createBtn: document.getElementById("createBtn"),
            createHelp: document.getElementById("createHelp"),
            statusBadge: document.getElementById("statusBadge"),
            refreshCandidatesBtn: document.getElementById("refreshCandidatesBtn"),
            shareBtn: document.getElementById("shareBtn"),
            copyShareBtn: document.getElementById("copyShareBtn"),
            startBtn: document.getElementById("startBtn"),
            stopBtn: document.getElementById("stopBtn"),
            redrawBtn: document.getElementById("redrawBtn"),
            closeBtn: document.getElementById("closeBtn"),
            shareUrlInput: document.getElementById("shareUrlInput"),
            shareHelp: document.getElementById("shareHelp"),
            stateBox: document.getElementById("stateBox")
          };

          function escapeHtmlClient(value) {
            return String(value || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/\"/g, "&quot;")
              .replace(/'/g, "&#39;");
          }

          function normalizeStatus(event) {
            return String(event && (event.displayStatus || event.status) || "closed");
          }

          function getStatusText(status) {
            switch (status) {
              case "ready": return "대기중";
              case "spinning": return "진행중";
              case "stopping": return "감속중";
              case "finished": return "추첨완료";
              case "closed": return "종료됨";
              default: return status || "알 수 없음";
            }
          }

          function getStatusClass(status) {
            switch (status) {
              case "ready": return "status-ready";
              case "spinning": return "status-spinning";
              case "stopping": return "status-stopping";
              case "finished": return "status-finished";
              default: return "status-closed";
            }
          }

          function getCandidateCount(event) {
            return Number(event && (event.drawCandidateCount || event.candidateCount || (Array.isArray(event.candidates) ? event.candidates.length : 0)) || 0);
          }

          function getCurrentCandidateCount(event) {
            return Number(event && (event.candidateCount || (Array.isArray(event.candidates) ? event.candidates.length : 0)) || 0);
          }

          function getActionState(event) {
            const status = normalizeStatus(event);
            const hasEvent = Boolean(event && event.id);

            return {
              canCreate: !hasEvent || status === "closed",
              canRefresh: hasEvent && status === "ready",
              canShare: hasEvent && status !== "closed",
              canStart: hasEvent && status === "ready",
              canStop: hasEvent && status === "spinning",
              canRedraw: hasEvent && status === "finished",
              canClose: hasEvent && (status === "ready" || status === "finished")
            };
          }

          function updateStatusBadge(event) {
            const status = normalizeStatus(event);
            els.statusBadge.className = "status-badge " + getStatusClass(status);
            els.statusBadge.textContent = event ? getStatusText(status) : "이벤트 없음";
          }

          function renderCandidates(items) {
            const candidates = Array.isArray(items) ? items : [];

            if (!candidates.length) {
              return '<div class="candidate-empty">후보가 없습니다. 대기 상태에서만 후보 새로고침이 가능하며, 추첨 완료 후에는 당시 후보 스냅샷을 유지합니다.</div>';
            }

            return '<ol class="candidate-list">' + candidates.map(function(item) {
              return '<li>' + escapeHtmlClient(item.ownerNickname || item.channelId || '-') + ' <span style="color:#98a2b3;">(채널ID: ' + escapeHtmlClient(item.channelId || '-') + ')</span></li>';
            }).join('') + '</ol>';
          }

          function renderState(event) {
            updateStatusBadge(event);

            if (!event) {
              els.stateBox.innerHTML = '<div class="empty-state">현재 활성 이벤트가 없습니다. 새 이벤트를 생성하면 이 영역에 상태가 표시됩니다.</div>';
              updateActionButtons();
              return;
            }

            const status = normalizeStatus(event);
            const candidateCount = getCandidateCount(event);
            const currentCandidateCount = getCurrentCandidateCount(event);
            const winnerName = event.winnerNickname || event.winnerChannelId || "";
            const winnerHtml = winnerName
              ? '<div class="winner-card"><div class="k">당첨자</div><div class="v">' + escapeHtmlClient(winnerName) + '</div></div>'
              : '';

            els.stateBox.innerHTML = '' +
              '<div class="summary-grid">' +
                '<div class="summary-item"><div class="k">이벤트 ID</div><div class="v small">' + escapeHtmlClient(event.id || '-') + '</div></div>' +
                '<div class="summary-item"><div class="k">상태</div><div class="v">' + escapeHtmlClient(getStatusText(status)) + '</div></div>' +
                '<div class="summary-item"><div class="k">이벤트명</div><div class="v">' + escapeHtmlClient(event.title || '-') + '</div></div>' +
                '<div class="summary-item"><div class="k">펀딩 담당자</div><div class="v">' + escapeHtmlClient(event.sponsorName || '-') + '</div></div>' +
                '<div class="summary-item"><div class="k">상품 / 금액</div><div class="v">' + escapeHtmlClient(event.prizeText || '-') + '</div></div>' +
                '<div class="summary-item"><div class="k">후보 수</div><div class="v">' + candidateCount + (candidateCount !== currentCandidateCount ? ' <span style="font-size:12px;color:#98a2b3;font-weight:700;">(현재 후보 ' + currentCandidateCount + '명)</span>' : '') + '</div></div>' +
              '</div>' +
              winnerHtml +
              '<div class="candidate-wrap">' +
                '<div class="candidate-head">' +
                  '<div class="title">후보 스냅샷</div>' +
                  '<div class="candidate-meta">추첨 완료 후에도 당시 후보 목록을 유지합니다.</div>' +
                '</div>' +
                renderCandidates(event.candidates || []) +
              '</div>';

            updateActionButtons();
          }

          function updateActionButtons() {
            const state = getActionState(currentEvent);
            const locked = actionLocked;

            els.createBtn.disabled = locked || !state.canCreate;
            els.refreshCandidatesBtn.disabled = locked || !state.canRefresh;
            els.shareBtn.disabled = locked || !state.canShare;
            els.copyShareBtn.disabled = locked || !lastShareUrl;
            els.startBtn.disabled = locked || !state.canStart;
            els.stopBtn.disabled = locked || !state.canStop;
            els.redrawBtn.disabled = locked || !state.canRedraw;
            els.closeBtn.disabled = locked || !state.canClose;

            els.createHelp.textContent = state.canCreate
              ? '지금은 새 이벤트를 생성할 수 있습니다.'
              : '활성 이벤트가 있으면 새 이벤트 생성은 막아두는 편이 안전합니다.';
          }

          async function loadCurrent() {
            const res = await fetch('/dashboard/api/roulette/current');
            const data = await res.json();

            if (res.status === 401) {
              location.href = '/dashboard/login';
              return;
            }

            if (!res.ok || !data.ok) {
              throw new Error(data.error || 'load_failed');
            }

            currentEvent = data.event || null;
            renderState(currentEvent);
          }

          async function safeLoadCurrent() {
            try {
              await loadCurrent();
            } catch (err) {
              els.stateBox.innerHTML = '<div class="empty-state">불러오기 실패: ' + escapeHtmlClient(err.message || 'unknown') + '</div>';
            }
          }

          async function postJson(url, body) {
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body || {})
            });

            const data = await res.json();

            if (res.status === 401) {
              location.href = '/dashboard/login';
              return null;
            }

            if (!res.ok || !data.ok) {
              throw new Error(data.error || 'request_failed');
            }

            return data;
          }

          async function withAction(task) {
            if (actionLocked) {
              return;
            }

            actionLocked = true;
            updateActionButtons();

            try {
              await task();
            } finally {
              actionLocked = false;
              updateActionButtons();
            }
          }

          async function requestShareUrl() {
            const res = await fetch('/dashboard/api/roulette/' + encodeURIComponent(currentEvent.id) + '/share');
            const data = await res.json();

            if (res.status === 401) {
              location.href = '/dashboard/login';
              return;
            }

            if (!res.ok || !data.ok) {
              throw new Error(data.error || 'share_failed');
            }

            lastShareUrl = String(data.url || '');
            els.shareUrlInput.value = lastShareUrl || '공유 링크를 만들지 못했습니다.';
            els.copyShareBtn.disabled = !lastShareUrl;
            els.shareHelp.textContent = '링크를 만든 뒤 복사 버튼으로 바로 전달할 수 있습니다.';
          }

          els.createBtn.addEventListener('click', function() {
            withAction(async function() {
              const title = els.titleInput.value.trim();
              const sponsorName = els.sponsorInput.value.trim();
              const prizeText = els.prizeInput.value.trim();

              const data = await postJson('/dashboard/api/roulette/create', {
                title: title,
                sponsorName: sponsorName,
                prizeText: prizeText
              });

              if (!data) return;

              currentEvent = data.event || null;
              lastShareUrl = '';
              els.shareUrlInput.value = '아직 생성되지 않았습니다.';
              els.shareHelp.textContent = '공유 링크 만들기를 눌러 외부에서 볼 수 있는 링크를 발급하세요.';
              renderState(currentEvent);
              alert('이벤트가 생성되었습니다.');
            }).catch(function(err) {
              alert('생성 실패: ' + err.message);
            });
          });

          els.refreshCandidatesBtn.addEventListener('click', function() {
            if (!currentEvent || !currentEvent.id) {
              alert('먼저 이벤트를 생성하세요.');
              return;
            }

            withAction(async function() {
              const data = await postJson('/dashboard/api/roulette/' + encodeURIComponent(currentEvent.id) + '/refresh-candidates');
              if (!data) return;
              currentEvent = data.event || null;
              renderState(currentEvent);
            }).catch(function(err) {
              alert('후보 새로고침 실패: ' + err.message);
            });
          });

          els.shareBtn.addEventListener('click', function() {
            if (!currentEvent || !currentEvent.id) {
              alert('먼저 이벤트를 생성하세요.');
              return;
            }

            withAction(async function() {
              await requestShareUrl();
            }).catch(function(err) {
              const message = err.message === 'public_base_url_required'
                ? 'PUBLIC_BASE_URL 설정이 필요합니다. localhost 주소는 실제 공유 링크로 사용할 수 없습니다.'
                : err.message;
              alert('공유 링크 생성 실패: ' + message);
            });
          });

          els.copyShareBtn.addEventListener('click', function() {
            if (!lastShareUrl) {
              alert('먼저 공유 링크를 생성하세요.');
              return;
            }

            navigator.clipboard.writeText(lastShareUrl)
              .then(function() {
                alert('공유 링크를 복사했습니다.');
              })
              .catch(function() {
                alert('클립보드 복사에 실패했습니다.');
              });
          });

          els.startBtn.addEventListener('click', function() {
            if (!currentEvent || !currentEvent.id) {
              alert('먼저 이벤트를 생성하세요.');
              return;
            }

            withAction(async function() {
              const data = await postJson('/dashboard/api/roulette/' + encodeURIComponent(currentEvent.id) + '/start');
              if (!data) return;
              currentEvent = data.event || null;
              renderState(currentEvent);
            }).catch(function(err) {
              alert('START 실패: ' + err.message);
            });
          });

          els.stopBtn.addEventListener('click', function() {
            if (!currentEvent || !currentEvent.id) {
              alert('먼저 이벤트를 생성하세요.');
              return;
            }

            withAction(async function() {
              const data = await postJson('/dashboard/api/roulette/' + encodeURIComponent(currentEvent.id) + '/stop');
              if (!data) return;
              currentEvent = data.event || null;
              renderState(currentEvent);
            }).catch(function(err) {
              alert('STOP 실패: ' + err.message);
            });
          });

          els.redrawBtn.addEventListener('click', function() {
            if (!currentEvent || !currentEvent.id) {
              alert('먼저 이벤트를 생성하세요.');
              return;
            }

            withAction(async function() {
              const data = await postJson('/dashboard/api/roulette/' + encodeURIComponent(currentEvent.id) + '/redraw');
              if (!data) return;
              currentEvent = data.event || null;
              renderState(currentEvent);
            }).catch(function(err) {
              alert('다시뽑기 실패: ' + err.message);
            });
          });

          els.closeBtn.addEventListener('click', function() {
            if (!currentEvent || !currentEvent.id) {
              alert('먼저 이벤트를 생성하세요.');
              return;
            }

            if (!confirm('이 이벤트를 종료할까요? 종료 후에는 현재 활성 이벤트에서 내려갑니다.')) {
              return;
            }

            withAction(async function() {
              const data = await postJson('/dashboard/api/roulette/' + encodeURIComponent(currentEvent.id) + '/close');
              if (!data) return;
              currentEvent = data.event || null;
              renderState(currentEvent);
              await safeLoadCurrent();
            }).catch(function(err) {
              alert('종료 실패: ' + err.message);
            });
          });

          safeLoadCurrent();
          setInterval(function() {
            if (!actionLocked) {
              safeLoadCurrent();
            }
          }, 2000);
        </script>
      </body>
    </html>
  `;
}

function renderRouletteLivePage({ eventId = "", token = "" } = {}) {
  return `
    <html lang="ko">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>이벤트 룰렛 LIVE</title>
        <style>
          :root{
            --bg:#0b0b0f;
            --panel:#15171d;
            --panel-2:#111318;
            --line:rgba(255,255,255,0.08);
            --line-strong:rgba(255,255,255,0.14);
            --text:#ffffff;
            --muted:#b6becd;
            --warning:#ffd166;
            --success:#4ade80;
            --info:#60a5fa;
            --shadow:0 24px 60px rgba(0,0,0,0.34);
          }
          *{box-sizing:border-box;}
          body{
            margin:0;
            background:radial-gradient(circle at top, rgba(96,165,250,0.10), transparent 26%), var(--bg);
            color:var(--text);
            font-family:Arial,sans-serif;
          }
          .page{
            max-width:1120px;
            margin:0 auto;
            padding:30px 22px 54px;
          }
          .shell{
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:18px;
          }
          .hero{
            width:100%;
            max-width:940px;
            text-align:center;
          }
          .title{
            font-size:54px;
            line-height:1.12;
            font-weight:1000;
            margin:0;
          }
          .top-meta{
            margin-top:16px;
            display:flex;
            flex-wrap:wrap;
            align-items:center;
            justify-content:center;
            gap:10px;
          }
          .badge{
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-width:94px;
            padding:10px 14px;
            border-radius:999px;
            font-size:13px;
            font-weight:900;
            letter-spacing:0.02em;
            border:1px solid transparent;
          }
          .status-ready{background:rgba(96,165,250,0.14);color:#bfdbfe;border-color:rgba(96,165,250,0.28);}
          .status-spinning{background:rgba(255,209,102,0.14);color:#ffe5a3;border-color:rgba(255,209,102,0.28);}
          .status-stopping{background:rgba(251,146,60,0.14);color:#fdba74;border-color:rgba(251,146,60,0.28);}
          .status-finished{background:rgba(74,222,128,0.14);color:#bbf7d0;border-color:rgba(74,222,128,0.28);}
          .status-closed{background:rgba(255,255,255,0.10);color:#d1d5db;border-color:rgba(255,255,255,0.12);}
          .meta-chip{
            padding:10px 14px;
            border-radius:999px;
            background:rgba(255,255,255,0.04);
            border:1px solid var(--line);
            color:#edf1f9;
            font-size:14px;
            font-weight:700;
          }
          .meta-chip span{
            color:var(--muted);
            font-weight:700;
            margin-right:6px;
          }
          .wheel-card,
          .candidate-card,
          .winner-card{
            width:100%;
            max-width:940px;
            background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)), var(--panel);
            border:1px solid var(--line);
            border-radius:28px;
            box-shadow:var(--shadow);
          }
          .wheel-card{
            padding:28px 20px 30px;
          }
          .wheel-wrap{
            position:relative;
            width:500px;
            height:500px;
            margin:6px auto 8px;
          }
          .pointer{
            position:absolute;
            left:50%;
            top:-2px;
            transform:translateX(-50%);
            width:0;
            height:0;
            border-left:20px solid transparent;
            border-right:20px solid transparent;
            border-bottom:36px solid #ff4d6d;
            z-index:40;
            filter:drop-shadow(0 8px 18px rgba(255,77,109,0.36));
          }
          .wheel{
            position:relative;
            width:100%;
            height:100%;
            border-radius:50%;
            overflow:hidden;
            background:#101217;
            border:14px solid rgba(255,255,255,0.12);
            box-shadow:inset 0 0 0 8px rgba(255,255,255,0.04), inset 0 0 70px rgba(0,0,0,0.34), 0 26px 50px rgba(0,0,0,0.26);
            will-change:transform;
            transform:rotate(0deg);
          }
          .sector-layer,
          .separator-layer,
          .label-layer,
          .confetti,
          .winner-overlay{
            position:absolute;
            inset:0;
            border-radius:50%;
          }
          .separator{
            position:absolute;
            left:50%;
            top:4%;
            width:3px;
            height:46%;
            transform-origin:50% 100%;
            background:rgba(255,255,255,0.42);
            box-shadow:0 0 10px rgba(255,255,255,0.16);
          }
          .slice-label{
            position:absolute;
            transform:translate(-50%, -50%);
            color:#ffffff;
            font-weight:1000;
            text-shadow:0 2px 8px rgba(0,0,0,0.45);
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            user-select:none;
            text-align:center;
            padding:0 6px;
          }
          .wheel-center{
            position:absolute;
            left:50%;
            top:50%;
            transform:translate(-50%, -50%);
            width:132px;
            height:132px;
            border-radius:50%;
            background:radial-gradient(circle at 30% 30%, #20232c, #111318);
            border:10px solid rgba(255,255,255,0.08);
            box-shadow:0 0 0 10px rgba(0,0,0,0.12), inset 0 0 18px rgba(255,255,255,0.04);
            display:flex;
            align-items:center;
            justify-content:center;
            text-align:center;
            padding:10px;
            font-size:24px;
            font-weight:1000;
            line-height:1.3;
            z-index:15;
          }
          .wheel-status{
            margin-top:14px;
            text-align:center;
            font-size:17px;
            font-weight:800;
            color:#eef2fb;
          }
          .winner-card{
            display:none;
            padding:22px 24px;
            text-align:center;
            border-color:rgba(255,209,102,0.24);
            background:linear-gradient(135deg, rgba(255,209,102,0.14), rgba(255,122,89,0.10));
          }
          .winner-card.show{
            display:block;
            animation:winnerPop 700ms cubic-bezier(0.16, 0.9, 0.22, 1) forwards, winnerGlow 1700ms ease-in-out infinite;
          }
          .winner-card .k{
            color:#ffe7a0;
            font-size:18px;
            font-weight:900;
            margin-bottom:8px;
          }
          .winner-card .v{
            color:var(--warning);
            font-size:48px;
            font-weight:1000;
            line-height:1.2;
            text-shadow:0 0 20px rgba(255,209,102,0.22), 0 8px 18px rgba(0,0,0,0.24);
            word-break:keep-all;
          }
          .candidate-card{
            padding:22px 24px;
          }
          .candidate-head{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            margin-bottom:14px;
          }
          .candidate-title{
            font-size:22px;
            font-weight:1000;
          }
          .candidate-sub{
            color:var(--muted);
            font-size:13px;
          }
          .candidate-list{
            list-style:none;
            padding:0;
            margin:0;
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:10px;
          }
          .candidate-item{
            padding:14px 16px;
            border-radius:16px;
            background:var(--panel-2);
            border:1px solid var(--line);
            font-size:17px;
            font-weight:800;
            text-align:center;
          }
          .candidate-empty{
            padding:16px;
            border-radius:16px;
            background:var(--panel-2);
            border:1px dashed var(--line-strong);
            color:var(--muted);
            text-align:center;
          }
          .winner-overlay{
            display:none;
            align-items:center;
            justify-content:center;
            pointer-events:none;
            z-index:50;
          }
          .winner-overlay.show{display:flex;}
          .winner-overlay-burst{
            position:absolute;
            width:320px;
            height:320px;
            border-radius:50%;
            background:radial-gradient(circle, rgba(255,219,102,0.45) 0%, rgba(255,219,102,0.18) 28%, rgba(255,219,102,0.04) 55%, rgba(255,219,102,0) 72%);
            animation:winnerBurst 900ms ease-out forwards;
            filter:blur(2px);
          }
          .winner-overlay-card{
            position:relative;
            z-index:2;
            min-width:300px;
            max-width:420px;
            padding:24px 28px;
            border-radius:24px;
            background:linear-gradient(135deg, rgba(255,214,102,0.24), rgba(255,122,89,0.18)), radial-gradient(circle at 30% 30%, rgba(255,255,255,0.16), rgba(255,255,255,0.03));
            border:1px solid rgba(255,214,102,0.38);
            box-shadow:0 20px 48px rgba(255,183,0,0.20);
            animation:winnerCardPop 700ms cubic-bezier(0.16, 0.9, 0.22, 1) forwards, winnerCardGlow 1600ms ease-in-out infinite;
          }
          .winner-overlay-badge{
            font-size:22px;
            font-weight:900;
            color:#fff1bf;
            margin-bottom:10px;
          }
          .winner-overlay-name{
            font-size:44px;
            line-height:1.18;
            font-weight:1000;
            color:var(--warning);
            text-shadow:0 0 20px rgba(255,209,102,0.34), 0 6px 18px rgba(0,0,0,0.28);
            word-break:keep-all;
          }
          .confetti-piece{
            position:absolute;
            left:50%;
            top:50%;
            width:12px;
            height:18px;
            border-radius:4px;
            opacity:0;
            transform:translate(-50%, -50%);
            animation:confettiBurst 1400ms ease-out forwards;
            box-shadow:0 4px 12px rgba(0,0,0,0.16);
          }
          @keyframes winnerBurst {
            0% {opacity:0;transform:scale(0.45);}
            35% {opacity:1;transform:scale(1.08);}
            100% {opacity:1;transform:scale(1);}
          }
          @keyframes winnerCardPop {
            0% {opacity:0;transform:translateY(22px) scale(0.84);}
            70% {opacity:1;transform:translateY(-4px) scale(1.03);}
            100% {opacity:1;transform:translateY(0) scale(1);}
          }
          @keyframes winnerCardGlow {
            0%,100% {box-shadow:0 20px 48px rgba(255,183,0,0.20);}
            50% {box-shadow:0 24px 60px rgba(255,183,0,0.32);}
          }
          @keyframes winnerPop {
            0% {opacity:0;transform:translateY(18px) scale(0.92);}
            65% {opacity:1;transform:translateY(-4px) scale(1.03);}
            100% {opacity:1;transform:translateY(0) scale(1);}
          }
          @keyframes winnerGlow {
            0%,100% {box-shadow:0 18px 40px rgba(255,183,0,0.12);}
            50% {box-shadow:0 22px 55px rgba(255,183,0,0.24);}
          }
          @keyframes confettiBurst {
            0% {
              opacity:1;
              transform:translate(-50%, -50%) rotate(0deg) scale(1);
            }
            100% {
              opacity:0;
              transform:translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--rot)) scale(0.9);
            }
          }
          @media (max-width: 820px){
            .title{font-size:42px;}
            .wheel-wrap{width:420px;height:420px;}
            .wheel-center{width:116px;height:116px;font-size:21px;}
            .candidate-list{grid-template-columns:1fr;}
          }
          @media (max-width: 560px){
            .page{padding:22px 14px 40px;}
            .title{font-size:34px;}
            .wheel-card,.candidate-card,.winner-card{border-radius:22px;}
            .wheel-wrap{width:320px;height:320px;}
            .wheel-center{width:92px;height:92px;font-size:17px;border-width:7px;}
            .winner-overlay-name{font-size:34px;}
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="shell">
            <div class="hero">
              <h1 id="title" class="title">이벤트 룰렛</h1>
              <div class="top-meta">
                <span id="statusBadge" class="badge status-ready">대기중</span>
                <span class="meta-chip"><span>펀딩 담당자</span><strong id="sponsorText">-</strong></span>
                <span class="meta-chip"><span>상품 / 금액</span><strong id="prizeText">-</strong></span>
                <span class="meta-chip"><span>후보 수</span><strong id="candidateCountText">0</strong></span>
              </div>
            </div>

            <div class="wheel-card">
              <div class="wheel-wrap">
                <div class="pointer"></div>
                <div id="wheel" class="wheel">
                  <div id="sectorLayer" class="sector-layer"></div>
                  <div id="separatorLayer" class="separator-layer"></div>
                  <div id="labelLayer" class="label-layer"></div>
                  <div id="confetti" class="confetti"></div>
                  <div id="wheelCenter" class="wheel-center">대기중</div>
                </div>
                <div id="winnerOverlay" class="winner-overlay">
                  <div class="winner-overlay-burst"></div>
                  <div class="winner-overlay-card">
                    <div class="winner-overlay-badge">🎉 당첨 🎉</div>
                    <div id="winnerOverlayName" class="winner-overlay-name"></div>
                  </div>
                </div>
              </div>
              <div id="wheelStatus" class="wheel-status">추첨 준비중</div>
            </div>

            <div id="winnerCard" class="winner-card">
              <div class="k">최종 당첨자</div>
              <div id="winnerName" class="v"></div>
            </div>

            <div class="candidate-card">
              <div class="candidate-head">
                <div class="candidate-title">후보 목록</div>
                <div class="candidate-sub">현재 화면은 시청용입니다. 조작 버튼은 보이지 않습니다.</div>
              </div>
              <div id="candidates"></div>
            </div>
          </div>
        </div>

        <script>
          const eventId = ${JSON.stringify(String(eventId || ""))};
          const token = ${JSON.stringify(String(token || ""))};

          const wheelEl = document.getElementById('wheel');
          const sectorLayerEl = document.getElementById('sectorLayer');
          const separatorLayerEl = document.getElementById('separatorLayer');
          const labelLayerEl = document.getElementById('labelLayer');
          const confettiEl = document.getElementById('confetti');
          const wheelCenterEl = document.getElementById('wheelCenter');
          const titleEl = document.getElementById('title');
          const sponsorTextEl = document.getElementById('sponsorText');
          const prizeTextEl = document.getElementById('prizeText');
          const candidateCountTextEl = document.getElementById('candidateCountText');
          const statusBadgeEl = document.getElementById('statusBadge');
          const wheelStatusEl = document.getElementById('wheelStatus');
          const candidatesEl = document.getElementById('candidates');
          const winnerCardEl = document.getElementById('winnerCard');
          const winnerNameEl = document.getElementById('winnerName');
          const winnerOverlayEl = document.getElementById('winnerOverlay');
          const winnerOverlayNameEl = document.getElementById('winnerOverlayName');

          let liveState = null;
          let spinningRafId = 0;
          let spinningStartedAt = 0;
          let lastSpinFrameAt = 0;
          let finishTimer = null;
          let overlayHideTimer = null;
          let currentRotation = 0;
          let stopAppliedKey = '';
          let winnerShownKey = '';
          let lastWheelSignature = '';
          const SPIN_DEG_PER_SEC = 720;

          function escapeHtmlClient(value) {
            return String(value || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\"/g, '&quot;')
              .replace(/'/g, '&#39;');
          }

          function normalizeStatus(event) {
            return String(event && (event.displayStatus || event.status) || 'ready');
          }

          function getStatusText(status) {
            switch (status) {
              case 'ready': return '대기중';
              case 'spinning': return '진행중';
              case 'stopping': return '감속중';
              case 'finished': return '추첨완료';
              case 'closed': return '종료됨';
              default: return status || '알 수 없음';
            }
          }

          function getWheelCenterText(status) {
            switch (status) {
              case 'spinning': return '룰렛\\n진행중';
              case 'stopping': return '감속중';
              case 'finished': return '당첨!';
              case 'closed': return '종료';
              default: return '대기중';
            }
          }

          function getStatusClass(status) {
            switch (status) {
              case 'ready': return 'status-ready';
              case 'spinning': return 'status-spinning';
              case 'stopping': return 'status-stopping';
              case 'finished': return 'status-finished';
              default: return 'status-closed';
            }
          }

          function getCandidateCount(event) {
            return Number(event && (event.drawCandidateCount || event.candidateCount || (Array.isArray(event.candidates) ? event.candidates.length : 0)) || 0);
          }

          function hashString(text) {
            const str = String(text || '');
            let hash = 0;
            for (let i = 0; i < str.length; i += 1) {
              hash = ((hash << 5) - hash) + str.charCodeAt(i);
              hash |= 0;
            }
            return Math.abs(hash);
          }

          function getCandidateColor(item, index) {
            const seed = hashString((item && item.channelId || '') + '|' + (item && item.ownerNickname || '') + '|' + index);
            const hue = seed % 360;
            return 'hsl(' + hue + 'deg 78% 58%)';
          }

          function buildConicGradient(items) {
            if (!items.length) {
              return '#111';
            }

            const step = 360 / items.length;
            const parts = [];

            items.forEach(function(item, index) {
              const start = (index * step).toFixed(3);
              const end = ((index + 1) * step).toFixed(3);
              parts.push(getCandidateColor(item, index) + ' ' + start + 'deg ' + end + 'deg');
            });

            return 'conic-gradient(' + parts.join(', ') + ')';
          }

          function renderSeparators(count) {
            separatorLayerEl.innerHTML = '';

            if (!count || count <= 1) {
              return;
            }

            const step = 360 / count;

            for (let i = 0; i < count; i += 1) {
              const line = document.createElement('div');
              line.className = 'separator';
              line.style.transform = 'translateX(-50%) rotate(' + (i * step) + 'deg)';
              separatorLayerEl.appendChild(line);
            }
          }

          function renderLabels(items) {
            labelLayerEl.innerHTML = '';

            if (!items.length) {
              return;
            }

            const step = 360 / items.length;
            const radiusPercent =
              items.length <= 2 ? 34 :
              items.length <= 4 ? 36 :
              items.length <= 6 ? 38 : 40;
            const fontSize =
              items.length <= 2 ? 22 :
              items.length <= 4 ? 20 :
              items.length <= 6 ? 18 : 15;
            const maxWidth =
              items.length <= 2 ? 190 :
              items.length <= 4 ? 150 :
              items.length <= 6 ? 122 : 96;

            items.forEach(function(item, index) {
              const middleAngle = (index * step) + (step / 2);
              const theta = (middleAngle - 90) * Math.PI / 180;
              const x = 50 + (Math.cos(theta) * radiusPercent);
              const y = 50 + (Math.sin(theta) * radiusPercent);

              const label = document.createElement('div');
              label.className = 'slice-label';
              label.textContent = item.ownerNickname || item.channelId || '-';
              label.style.left = x + '%';
              label.style.top = y + '%';
              label.style.fontSize = fontSize + 'px';
              label.style.maxWidth = maxWidth + 'px';
              labelLayerEl.appendChild(label);
            });
          }

          function renderWheel(items) {
            const candidates = Array.isArray(items) ? items : [];
            const signature = JSON.stringify(candidates.map(function(item) {
              return {
                channelId: item.channelId,
                ownerNickname: item.ownerNickname
              };
            }));

            if (signature === lastWheelSignature) {
              return;
            }

            lastWheelSignature = signature;
            sectorLayerEl.style.background = buildConicGradient(candidates);
            renderSeparators(candidates.length);
            renderLabels(candidates);
          }

          function renderCandidatesList(items) {
            const candidates = Array.isArray(items) ? items : [];

            if (!candidates.length) {
              candidatesEl.innerHTML = '<div class="candidate-empty">후보가 없습니다.</div>';
              return;
            }

            candidatesEl.innerHTML = '<ul class="candidate-list">' + candidates.map(function(item, idx) {
              return '<li class="candidate-item">' + (idx + 1) + '. ' + escapeHtmlClient(item.ownerNickname || item.channelId || '-') + '</li>';
            }).join('') + '</ul>';
          }

          function setWheelRotation(deg, transitionMs) {
            wheelEl.style.transition = typeof transitionMs === 'number'
              ? 'transform ' + transitionMs + 'ms cubic-bezier(0.12, 0.82, 0.18, 1)'
              : 'none';
            currentRotation = deg;
            wheelEl.style.transform = 'rotate(' + deg + 'deg)';
          }

          function stepSpinFrame(timestamp) {
            if (!lastSpinFrameAt) {
              lastSpinFrameAt = timestamp;
            }

            const deltaMs = Math.max(0, timestamp - lastSpinFrameAt);
            lastSpinFrameAt = timestamp;

            currentRotation += (SPIN_DEG_PER_SEC * deltaMs) / 1000;
            wheelEl.style.transform = 'rotate(' + currentRotation + 'deg)';

            spinningRafId = window.requestAnimationFrame(stepSpinFrame);
          }

          function startSpinLoop() {
            if (spinningRafId) {
              return;
            }

            wheelEl.style.transition = 'none';
            spinningStartedAt = Date.now();
            lastSpinFrameAt = 0;
            spinningRafId = window.requestAnimationFrame(stepSpinFrame);
          }

          function stopSpinLoop() {
            if (!spinningRafId) {
              return;
            }

            window.cancelAnimationFrame(spinningRafId);
            spinningRafId = 0;
            lastSpinFrameAt = 0;
          }

          function launchConfetti() {
            confettiEl.innerHTML = '';
            const count = 28;

            for (let i = 0; i < count; i += 1) {
              const piece = document.createElement('div');
              piece.className = 'confetti-piece';

              const angle = (Math.PI * 2 * i) / count;
              const distance = 130 + Math.random() * 170;
              const dx = Math.cos(angle) * distance;
              const dy = Math.sin(angle) * distance;
              const hue = Math.floor(Math.random() * 360);

              piece.style.setProperty('--dx', dx + 'px');
              piece.style.setProperty('--dy', dy + 'px');
              piece.style.setProperty('--rot', ((Math.random() * 720) - 360).toFixed(0) + 'deg');
              piece.style.background = 'hsl(' + hue + 'deg 90% 60%)';
              piece.style.animationDelay = (Math.random() * 0.18).toFixed(2) + 's';

              confettiEl.appendChild(piece);
            }

            setTimeout(function() {
              confettiEl.innerHTML = '';
            }, 1700);
          }

          function hideWinnerPresentation(resetKey) {
            clearTimeout(overlayHideTimer);
            winnerOverlayEl.classList.remove('show');
            winnerOverlayEl.style.display = 'none';
            winnerOverlayNameEl.textContent = '';
            winnerCardEl.classList.remove('show');
            winnerNameEl.textContent = '';

            if (resetKey) {
              winnerShownKey = '';
            }
          }

          function showWinnerPresentation(event) {
            const key = [
              event && event.id || '',
              event && event.winnerChannelId || '',
              event && event.winnerNickname || '',
              event && event.stopRequestedAtMs || ''
            ].join(':');

            if (winnerShownKey === key) {
              return;
            }

            winnerShownKey = key;
            const winnerName = event && (event.winnerNickname || event.winnerChannelId) || '당첨자';

            winnerOverlayNameEl.textContent = winnerName;
            winnerOverlayEl.style.display = 'flex';
            winnerOverlayEl.classList.remove('show');
            void winnerOverlayEl.offsetWidth;
            winnerOverlayEl.classList.add('show');

            winnerNameEl.textContent = winnerName;
            winnerCardEl.classList.remove('show');
            void winnerCardEl.offsetWidth;
            winnerCardEl.classList.add('show');

            launchConfetti();

            clearTimeout(overlayHideTimer);
            overlayHideTimer = setTimeout(function() {
              winnerOverlayEl.classList.remove('show');
              winnerOverlayEl.style.display = 'none';
            }, 10000);
          }

          function scheduleLocalFinish(event) {
            clearTimeout(finishTimer);

            const stopRequestedAtMs = Number(event && event.stopRequestedAtMs || 0);
            const stopDurationMs = Number(event && event.stopDurationMs || 6500);
            const remain = Math.max(0, (stopRequestedAtMs + stopDurationMs) - Date.now());

            finishTimer = setTimeout(function() {
              if (!liveState) {
                return;
              }

              const next = Object.assign({}, liveState, {
                status: 'finished',
                displayStatus: 'finished'
              });

              render(next);
            }, remain + 40);
          }

          function applyStoppingAnimation(event) {
            const stopRequestedAtMs = Number(event && event.stopRequestedAtMs || 0);

            if (!stopRequestedAtMs) {
              console.warn('[roulette-live] ignoring stopping animation without stopRequestedAtMs', event);
              return;
            }

            const candidates = Array.isArray(event && event.candidates) ? event.candidates : [];
            const count = candidates.length || 1;
            const targetIndex = Number.isFinite(Number(event && event.targetIndex)) ? Number(event.targetIndex) : 0;
            const turns = Number.isFinite(Number(event && event.finalRotationTurns)) ? Number(event.finalRotationTurns) : 8;
            const stopDurationMs = Number.isFinite(Number(event && event.stopDurationMs)) ? Number(event.stopDurationMs) : 6500;

            const sliceAngle = 360 / count;
            const targetMiddleAngle = (targetIndex * sliceAngle) + (sliceAngle / 2);
            const normalizedTargetRotation = (360 - targetMiddleAngle + 360) % 360;
            const currentMod = ((currentRotation % 360) + 360) % 360;
            const delta = ((normalizedTargetRotation - currentMod) + 360) % 360;
            const nextRotation = currentRotation + (turns * 360) + delta;

            console.log('[roulette-live] applyStoppingAnimation', {
              eventId: event && event.id,
              targetIndex,
              stopRequestedAtMs,
              stopDurationMs,
              fromRotation: currentRotation,
              toRotation: nextRotation
            });

            setWheelRotation(nextRotation, stopDurationMs);
          }

          function updateMotion(event) {
            const status = normalizeStatus(event);
            const stoppingKey = [
              event && event.id || '',
              event && event.stopRequestedAtMs || '',
              event && event.targetIndex || ''
            ].join(':');

            wheelCenterEl.innerHTML = getWheelCenterText(status).replace(/\\n/g, '<br/>');
            wheelStatusEl.textContent = '상태: ' + getStatusText(status);

            console.log('[roulette-live] updateMotion', {
              eventId: event && event.id,
              status,
              stopRequestedAtMs: event && event.stopRequestedAtMs || 0,
              targetIndex: event && event.targetIndex,
              currentRotation,
              spinningForMs: spinningStartedAt ? (Date.now() - spinningStartedAt) : 0
            });

            if (status === 'spinning') {
              clearTimeout(finishTimer);
              stopAppliedKey = '';
              hideWinnerPresentation(false);
              startSpinLoop();
              return;
            }

            if (status === 'stopping') {
              if (!Number(event && event.stopRequestedAtMs || 0)) {
                console.warn('[roulette-live] stopping state ignored because stopRequestedAtMs is empty', event);
                return;
              }

              hideWinnerPresentation(false);
              stopSpinLoop();

              if (stopAppliedKey !== stoppingKey) {
                stopAppliedKey = stoppingKey;
                applyStoppingAnimation(event);
              }

              scheduleLocalFinish(event);
              return;
            }

            clearTimeout(finishTimer);
            stopSpinLoop();

            if (status === 'finished') {
              showWinnerPresentation(event);
            } else {
              hideWinnerPresentation(true);
            }
          }

          function render(event) {
            liveState = event;

            if (!event) {
              titleEl.textContent = '이벤트를 찾을 수 없습니다.';
              sponsorTextEl.textContent = '-';
              prizeTextEl.textContent = '-';
              candidateCountTextEl.textContent = '0';
              statusBadgeEl.className = 'badge status-closed';
              statusBadgeEl.textContent = '이벤트 없음';
              wheelStatusEl.textContent = '이벤트를 찾을 수 없습니다.';
              renderCandidatesList([]);
              return;
            }

            const status = normalizeStatus(event);
            titleEl.textContent = event.title || '이벤트 룰렛';
            sponsorTextEl.textContent = event.sponsorName || '-';
            prizeTextEl.textContent = event.prizeText || '-';
            candidateCountTextEl.textContent = String(getCandidateCount(event));
            statusBadgeEl.className = 'badge ' + getStatusClass(status);
            statusBadgeEl.textContent = getStatusText(status);

            renderWheel(event.candidates || []);
            renderCandidatesList(event.candidates || []);
            updateMotion(event);
          }

          async function loadInitial() {
            const res = await fetch('/api/public/roulette/' + encodeURIComponent(eventId) + '?token=' + encodeURIComponent(token));
            const data = await res.json();

            if (!res.ok || !data.ok) {
              throw new Error(data.error || 'load_failed');
            }

            console.log('[roulette-live] initial state', {
              eventId: data && data.event && data.event.id,
              status: data && data.event && (data.event.displayStatus || data.event.status),
              stopRequestedAtMs: data && data.event && data.event.stopRequestedAtMs || 0,
              targetIndex: data && data.event && data.event.targetIndex
            });
            render(data.event || null);
          }

          const es = new EventSource('/api/public/roulette/' + encodeURIComponent(eventId) + '/stream?token=' + encodeURIComponent(token));
          es.addEventListener('state', function(e) {
            try {
              const data = JSON.parse(e.data);
              console.log('[roulette-live] sse state', {
                eventId: data && data.id,
                status: data && (data.displayStatus || data.status),
                stopRequestedAtMs: data && data.stopRequestedAtMs || 0,
                targetIndex: data && data.targetIndex
              });
              render(data);
            } catch (err) {
              console.error('[roulette-live] sse parse error', err);
            }
          });

          loadInitial().catch(function(err) {
            titleEl.textContent = '초기 로드 실패';
            wheelStatusEl.textContent = err.message || '알 수 없는 오류';
          });
        </script>
      </body>
    </html>
  `;
}

module.exports = {
  renderRouletteDashboardPage,
  renderRouletteLivePage
};