import { $ } from '@joplo-app/kit';
import { Scene3D } from 'joplo-plugin-scene3d';

/**
 * 客厅与玄关的 3D 场景：单位是米，y 向上，地面 y = 0。墙在后方（z = -3）和左侧（x = -4），
 * 等轴视角从右前方看进来。灯、窗是可以点的 Target；空调、电视、门的状态随 $.data 变化。
 */
export const Home = () => (
  <Scene3D id="home" height={704} focus={$.ui.focus} label="客厅与玄关">
    <Scene3D.Object id="floor" shape="floor" size={[8, 0.1, 6]} />
    <Scene3D.Object id="wall_back" shape="wall" at={[0, 1.4, -3.05]} size={[8, 2.8, 0.1]} />
    <Scene3D.Object id="wall_left" shape="wall" at={[-4.05, 1.4, 0]} size={[0.1, 2.8, 6]} />
    <Scene3D.Object id="rug" shape="box" at={[-1.4, 0, -1.1]} size={[2.6, 0.02, 1.8]} color="line" />
    <Scene3D.Object id="sofa" shape="sofa" at={[-1.4, 0, -2.4]} size={[2.2, 0.8, 0.9]} color="info" />
    <Scene3D.Object id="table" shape="table" at={[-1.4, 0, -1.0]} size={[1.1, 0.42, 0.6]} />
    <Scene3D.Object id="tv" shape="tv" at={[-3.96, 1.45, -1.1]} rotate={90} lit={$.data.tv} label="电视" />
    <Scene3D.Object id="ac" shape="ac" at={[0.9, 2.35, -2.95]} lit={$.data.ac} label="空调" showLabel />
    <Scene3D.Target id="lamp" shape="lamp" at={[0.6, 0, -2.4]} lit={$.data.lamp} label="落地灯" />
    <Scene3D.Target id="window" shape="window" at={[2.4, 1.5, -2.97]} size={[1.6, 1.2, 0.08]} open={$.data.windowOpen} label="客厅窗" />
    <Scene3D.Object id="plant" shape="plant" at={[3.4, 0, -2.4]} />
    <Scene3D.Object id="speaker" shape="speaker" at={[-2.9, 0, -2.6]} lit={$.data.speaker} />
    <Scene3D.Object id="door" shape="door" at={[-3.98, 0, 2.0]} rotate={90} label={$.data.doorLabel} showLabel />
  </Scene3D>
);
