import * as THREE from 'three';
import { describe,expect,it,vi } from 'vitest';
import { grassHabitat,grassLod,groundSlope,makeGrassTile } from '../src/world/grass-layout.ts';
import { GrassField,makeGrassClump } from '../src/world/GrassField.ts';
import { pathX,terrainHeight } from '../src/world/spatial.ts';

describe('living geometry grass',()=>{
  it('uses curved segmented blades with planted roots and genuinely tapered tips, not images',()=>{
    const geometry=makeGrassClump(10,5),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
    expect(p.count).toBe(10*6*3);expect(geometry.index?.count).toBe(10*5*12);
    for(let blade=0;blade<10;blade++){
      const start=blade*18,tip=start+15;
      expect(p.getY(start)).toBe(0);expect(uv.getY(start)).toBe(0);
      expect(p.getY(tip)).toBeGreaterThan(.15);expect(uv.getY(tip)).toBe(1);
      const root=new THREE.Vector3().fromBufferAttribute(p,start+1),end=new THREE.Vector3().fromBufferAttribute(p,tip+1);
      expect(Math.hypot(root.x-end.x,root.z-end.z)).toBeGreaterThan(.05);
      expect(new THREE.Vector3().fromBufferAttribute(p,tip).distanceTo(new THREE.Vector3().fromBufferAttribute(p,tip+2))).toBeLessThan(.0001);
    }
    for(let i=0;i<n.count;i++)expect(new THREE.Vector3().fromBufferAttribute(n,i).length()).toBeCloseTo(1,5);
    geometry.dispose();
  });
  it('makes a stable dense field with no grass growing in the path, trunks or spring',()=>{
    const obstacle={x:6,z:-8,radius:1.2,height:20};
    expect(makeGrassTile(0,-1,[obstacle])).toEqual(makeGrassTile(0,-1,[obstacle]));
    const tile=makeGrassTile(0,-1,[obstacle]);expect(tile.sites.length).toBeGreaterThan(100);
    for(const site of tile.sites){expect(Math.hypot(site.x-obstacle.x,site.z-obstacle.z)).toBeGreaterThan(obstacle.radius+.17);expect(site.y).toBeCloseTo(terrainHeight(site.x,site.z)-.016);}
    expect(grassHabitat(pathX(-15),-15,[])).toBe(0);expect(grassHabitat(25,-15,[])).toBe(0);expect(grassHabitat(6,-8,[obstacle])).toBe(0);
  });
  it('attaches offset blade roots to hills rather than floating at the tile height',()=>{
    for(const [x,z]of[[25,40],[-30,25],[50,-32]]){
      const slope=groundSlope(x,z),dx=.18,dz=-.14;
      expect(Math.abs(terrainHeight(x,z)+dx*slope.x+dz*slope.z-terrainHeight(x+dx,z+dz))).toBeLessThan(.01);
    }
  });
  it('reduces geometry with distance and releases its rendering resources once',()=>{
    expect(grassLod(5)).toBe('near');expect(grassLod(25)).toBe('middle');expect(grassLod(50)).toBe('far');expect(grassLod(70)).toBe('hidden');
    const field=new GrassField([]),camera=new THREE.PerspectiveCamera(64,1,.1,200);camera.position.set(0,2,17);camera.lookAt(0,1,-10);camera.updateMatrixWorld(true);
    field.update(.1,camera,false);const meshes=field.group.children as THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>[];
    expect(meshes.some(mesh=>mesh.visible)).toBe(true);expect(meshes.some(mesh=>!mesh.visible)).toBe(true);
    expect(meshes.every(mesh=>mesh.geometry.isInstancedBufferGeometry)).toBe(true);expect(meshes.every(mesh=>!('map'in mesh.material.uniforms))).toBe(true);
    const material=meshes[0].material,before=material.uniforms.grassTime.value;field.update(.2,camera,true);expect(material.uniforms.grassTime.value).toBe(before);
    const spy=vi.fn();material.addEventListener('dispose',spy);field.dispose();field.dispose();expect(spy).toHaveBeenCalledOnce();
  });
});
