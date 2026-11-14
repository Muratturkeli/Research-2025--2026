import { createCampusScene } from './scene/campus.js';
import { bindHud } from './ui/hud.js';

const canvas = document.getElementById('c');
const loading = document.getElementById('loading');
const loadBar = document.getElementById('loadBar');
const status = document.getElementById('statusChip');

function setProgress(p) {
  if (loadBar) loadBar.style.width = `${Math.round(p * 100)}%`;
  if (loadBar) loadBar.style.animation = 'none';
}

async function boot() {
  try {
    status.textContent = 'LOADING';
    const api = await createCampusScene(canvas, {
      onProgress: setProgress,
    });
    bindHud(api);
    loading?.classList.add('hide');
    status.textContent = 'LIVE';
  } catch (err) {
    console.error(err);
    status.textContent = 'ERROR';
    if (loading) {
      loading.querySelector('.brand').textContent = 'SCENE FAILED TO LOAD';
      const fine = document.createElement('p');
      fine.style.color = '#8aa4a8';
      fine.style.fontSize = '0.8rem';
      fine.textContent = String(err?.message || err);
      loading.querySelector('.loading-inner')?.appendChild(fine);
    }
  }
}

boot();
