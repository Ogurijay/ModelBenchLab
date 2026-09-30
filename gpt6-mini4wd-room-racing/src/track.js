import { CatmullRomCurve3, Vector3 } from 'three';
export const LANES = 4;
export const LANE_WIDTH = .94;
export const START = .06;
export const wrap = n => ((n % 1) + 1) % 1;
const lerp = (a,b,t) => a + (b-a)*t;

export class Track {
  constructor(definition) {
    this.definition = definition;
    const curve = new CatmullRomCurve3(definition.points.map(p => new Vector3(...p)), true, 'centripetal');
    curve.arcLengthDivisions = 2400;
    this.samples = 1600;
    this.paths = Array.from({length: LANES}, (_,lane) => {
      const points = [], lengths = [0], offset = (lane - 1.5) * LANE_WIDTH;
      for (let i=0;i<=this.samples;i++) {
        const q = i / this.samples, p = curve.getPointAt(q), t = curve.getTangentAt(q);
        const h = Math.hypot(t.x,t.z);
        p.x += -t.z / h * offset; p.z += t.x / h * offset;
        if (definition.hill && q>.27 && q<.49) p.y += 1.75 * Math.sin((q-.27)/.22*Math.PI)**2;
        // Catmull-Rom can undershoot flat control points beside the elevated bridge.
        p.y = Math.max(0,p.y) + .24;
        points.push(p);
        if (i) lengths.push(lengths[i-1]+p.distanceTo(points[i-1]));
      }
      return { points, lengths, length: lengths.at(-1) };
    });
    this.length = this.paths.reduce((sum,p)=>sum+p.length,0)/LANES;
    this._a = new Vector3(); this._b = new Vector3();
  }
  // Shared longitudinal parameter preserves adjacent lanes at crossover and lane switches.
  point(q,lane=1.5) {
    const u=wrap(q)*this.samples, index=Math.floor(u), blend=u-index;
    lane=Math.max(0,Math.min(3,lane));
    const l=Math.floor(lane), r=Math.min(3,l+1);
    const a=this.paths[l].points[index].clone().lerp(this.paths[l].points[index+1],blend);
    const b=this.paths[r].points[index].clone().lerp(this.paths[r].points[index+1],blend);
    return a.lerp(b,lane-l);
  }
  pose(progress,lane=1.5) {
    const q=wrap(progress+START), p=this.point(q,lane), before=this.point(q-.001,lane), after=this.point(q+.001,lane);
    const tangent=after.clone().sub(before).normalize();
    const t0=p.clone().sub(before).normalize(), t1=after.clone().sub(p).normalize();
    const localLength=before.distanceTo(after)/.002;
    const curvature=t0.angleTo(t1)/Math.max(.02,(before.distanceTo(p)+after.distanceTo(p))/2);
    return { p, tangent, yaw:Math.atan2(tangent.x,tangent.z), pitch:-Math.asin(tangent.y), curvature, localLength, slope:tangent.y, q };
  }
  canChange(progress) { const q=wrap(progress+START); return q>=.065 && q<=.205; }
}
