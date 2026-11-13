
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.12.0/rapier.es.js';

const $ = (s) => document.querySelector(s);
const isCoarse = matchMedia('(pointer: coarse)').matches;
const DPR = window.devicePixelRatio || 1;

