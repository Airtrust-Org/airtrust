export const MOBILE_DRAWER_HELPER_JS = `
      var injectDrawerFix = function() {
        if (!doc) return;
        if (doc.__airtrustDrawerInjected) return;
        doc.__airtrustDrawerInjected = true;
        
        var style = doc.createElement('style');
        style.innerHTML = 
          '#airtrust-drawer-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99998; }' +
          '#airtrust-drawer-close { display: none; position: fixed; top: 16px; right: 16px; width: 44px; height: 44px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; font-size: 20px; z-index: 99999; cursor: pointer; justify-content: center; align-items: center; }' +
          'body.airtrust-drawer-open #airtrust-drawer-backdrop { display: block; }' +
          'body.airtrust-drawer-open #airtrust-drawer-close { display: flex; }' +
          'body.airtrust-drawer-open { overflow: hidden !important; }';
        doc.head.appendChild(style);

        var backdrop = doc.createElement('div');
        backdrop.id = 'airtrust-drawer-backdrop';
        var closeBtn = doc.createElement('button');
        closeBtn.id = 'airtrust-drawer-close';
        closeBtn.innerHTML = '✕';
        closeBtn.setAttribute('aria-label', 'Fechar menu');
        
        doc.body.appendChild(backdrop);
        doc.body.appendChild(closeBtn);

        var closeDrawer = function() {
          var openToggle = doc.querySelector('.nav-sidebar-is-open .js-nav-sidebar-toggle, .is-open .nav-sidebar-toggle');
          if (openToggle && typeof openToggle.click === 'function') {
            openToggle.click();
          }
          doc.body.classList.remove('airtrust-drawer-open');
          postToParent({ type: 'lms:drawer-closed', matriculaId: MATRICULA_ID });
        };

        backdrop.addEventListener('click', closeDrawer);
        closeBtn.addEventListener('click', closeDrawer);
        doc.addEventListener('keydown', function(e) {
          if (e.key === 'Escape' && doc.body.classList.contains('airtrust-drawer-open')) closeDrawer();
        });

        var checkDrawer = function() {
          var isOpen = doc.querySelector('.nav-sidebar-is-open, .lesson-sidebar.is-open, .nav-sidebar.is-open') !== null;
          var wasOpen = doc.body.classList.contains('airtrust-drawer-open');
          if (isOpen && !wasOpen) {
            doc.body.classList.add('airtrust-drawer-open');
            postToParent({ type: 'lms:drawer-opened', matriculaId: MATRICULA_ID });
          } else if (!isOpen && wasOpen) {
            doc.body.classList.remove('airtrust-drawer-open');
            postToParent({ type: 'lms:drawer-closed', matriculaId: MATRICULA_ID });
            // Devolve o foco original, se necessário, ao fechar (ex: botão de menu)
            var toggle = doc.querySelector('.js-nav-sidebar-toggle, .nav-sidebar-toggle');
            if (toggle && typeof toggle.focus === 'function') toggle.focus();
          }
        };

        var observer = new MutationObserver(checkDrawer);
        var sidebarContainer = doc.querySelector('.nav-sidebar, .lesson-sidebar, .sidebar, #scorm-layout, #scorm-player');
        
        if (sidebarContainer) {
          observer.observe(sidebarContainer, { attributes: true, childList: true, subtree: true });
        } else {
          observer.observe(doc.body, { attributes: true, childList: true, subtree: false });
        }
        
        var clickHandler = function() {
          window.setTimeout(checkDrawer, 50);
        };
        doc.addEventListener('click', clickHandler);

        window.addEventListener('unload', function() {
          if (observer) observer.disconnect();
          doc.removeEventListener('click', clickHandler);
        });
      };
      
      if (doc.body) {
        injectDrawerFix();
      } else {
        doc.addEventListener('DOMContentLoaded', injectDrawerFix);
      }
`;
