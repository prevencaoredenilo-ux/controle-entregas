/**
 * NILO ENTREGAS • COMPATIBILIDADE V33.2
 * Este arquivo existe somente porque o public-sync V32 legado ainda o referencia.
 * A antiga camada visual V32 foi desativada para não concorrer com a V33 aprovada.
 * Não lê nem grava dados do sistema.
 */
(() => {
  'use strict';
  const href = 'nilo-v33-2-final.css?v=33.2.0';
  function apply(){
    if(!document.querySelector('link[data-nilo-v33-2-final]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href=href;
      link.dataset.niloV332Final='1';
      document.head.appendChild(link);
    }
    document.documentElement.setAttribute('data-nilo-visual-version','33.2.0');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,120),{once:true});
  else setTimeout(apply,120);
})();
