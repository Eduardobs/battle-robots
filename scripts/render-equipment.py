"""Bake the equipment art for the hangar and arena. Run with Python and Pillow."""
from math import cos, sin, pi, sqrt
from pathlib import Path
from PIL import Image, ImageColor, ImageDraw, ImageFilter

OUTPUT = Path(__file__).resolve().parents[1] / 'assets' / 'equipment'
STEEL, ALLOY, IRON, RUBBER = '#a2afb2', '#dae2df', '#515b60', '#32383a'
BRASS, RED, ICE, BLUE, GREEN, VIOLET = '#d79541', '#bd482b', '#59c6da', '#377abe', '#8dc564', '#976de1'


class Model:
    def __init__(self):
        self.faces = []

    def extrusion(self, ring, axis, start, end, color):
        def point(a, b, depth):
            if axis == 'x':
                return (depth, a, b)
            if axis == 'y':
                return (a, depth, b)
            return (a, b, depth)
        bottom = [point(a, b, start) for a, b in ring]
        top = [point(a, b, end) for a, b in ring]
        self.faces.extend([(bottom[::-1], color), (top, color)])
        for i in range(len(ring)):
            j = (i + 1) % len(ring)
            self.faces.append(([bottom[i], bottom[j], top[j], top[i]], color))

    def tube(self, axis, start, end, a, b, radius, color, sides=16):
        ring = [(a + radius*cos(i*2*pi/sides), b + radius*sin(i*2*pi/sides)) for i in range(sides)]
        self.extrusion(ring, axis, start, end, color)

    def box(self, x, y, z, length, width, height, color, bevel=.5):
        w, h = length/2, width/2
        c = min(bevel, w/2, h/2)
        ring = [(x+i, y+j) for i, j in [(-w+c,-h),(w-c,-h),(w,-h+c),(w,h-c),
                                          (w-c,h),(-w+c,h),(-w,h-c),(-w,-h+c)]]
        self.extrusion(ring, 'z', z, z+height, color)

    def tank(self, x, y, z, length, radius, color):
        end = x + length
        self.tube('x', x, end, y, z, radius, color)
        for pos in [x+1, end-2]:
            self.tube('x', pos, pos+1, y, z, radius+.35, ALLOY)
        self.tube('x', end, end+1.5, y, z, radius*.55, IRON)

    def render(self, top):
        size = 240
        image = Image.new('RGBA', (size, size))
        pen = ImageDraw.Draw(image)
        def project(p):
            x, y, z = p
            if top:
                return (x, y, z)
            return (.56*x-.83*y, .53*x+.36*y-.77*z, .64*x+.43*y+.64*z)
        def depth(face):
            return sum(project(p)[2] for p in face[0])/len(face[0])
        shadow = Image.new('RGBA', image.size)
        if not top:
            shadow_pen = ImageDraw.Draw(shadow)
            for face, _ in self.faces:
                points = [project((x+.20*z, y+.25*z, 0)) for x,y,z in face]
                shadow_pen.polygon([(120+5.1*x,126+5.1*y) for x,y,_ in points], fill=(13,11,10,118))
            shadow = shadow.filter(ImageFilter.GaussianBlur(4))
        for face, material in sorted(self.faces, key=depth):
            a, b, c = face[:3]
            u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
            n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
            norm = sqrt(sum(t*t for t in n))
            if not norm:
                continue
            if project(n)[2] < 0:
                n = [-t for t in n]
            light = sum(t*s for t,s in zip(n, [-.32,-.50,.80]))/norm
            shade = .76 + .39*light
            color = tuple(min(255, round(t*shade)) for t in ImageColor.getrgb(material))
            polygon = [(120+5.1*project(p)[0], 126+5.1*project(p)[1]) for p in face]
            pen.polygon(polygon, fill=color)
            # Narrow reflected edges make bevels and separate metal parts readable.
            if not top and shade > .94:
                edge = tuple(min(255,t+22) for t in color)
                pen.line(polygon+[polygon[0]], fill=edge, width=1)
        shadow.alpha_composite(image)
        return shadow.resize((96,96),Image.Resampling.LANCZOS)


def equipment(key):
    m = Model()
    m.box(-3,0,0,12,10,2,IRON,1.7)
    for y in [-3.6,3.6]:
        m.tube('z',2,2.7,-7,y,.9,ALLOY,6)
    if key == 'flame':
        m.tank(-11,3,5,12,3.2,RED)
        m.tube('x',-6,12,-2,5,2.5,IRON)
        for x in [3,6,9]:
            m.tube('x',x,x+1,-2,5,3.1,BRASS)
        m.tube('x',11,15,-2,5,3.7,STEEL)
        m.tube('x',15,15.4,-2,5,2.5,RUBBER)
        m.tube('x',15.4,16,-2,5,1.1,'#ffb645')
    elif key == 'nitrogen':
        for y in [-3,3]:
            m.tank(-11,y,5,13,2.9,ICE)
        m.tube('x',2,13,0,5,2.3,ALLOY)
        for x in [5,8,11]:
            m.tube('x',x,x+1,0,5,3.1,BLUE)
    elif key == 'pistol':
        m.box(-3,0,2,13,7,4,IRON)
        m.box(2,0,6,22,5.8,4,STEEL)
        m.tube('x',10,18,0,8,2.1,ALLOY)
        m.tube('x',18,18.3,0,8,1.5,RUBBER)
        for x in [-7,-5,-3]:
            m.box(x,0,10,.8,5,.6,RUBBER)
        m.box(11,0,10,1.4,1.5,1.6,BRASS)
    elif key == 'saw':
        m.box(1,0,2,20,3.5,3,IRON)
        ring = []
        for i in range(16):
            for angle,r in [(i,7.3),(i+.78,9.2)]:
                ring.append((10+r*cos(angle*pi/8),r*sin(angle*pi/8)))
        m.extrusion(ring,'z',5,6.4,ALLOY)
        m.tube('z',6.4,7,10,0,6.2,STEEL)
        m.tube('z',7,8,10,0,2.5,BRASS,6)
    elif key == 'hammer':
        m.tube('y',-5,5,-5,5,3.6,BRASS)
        m.box(3,0,5,18,3,3,STEEL)
        m.box(12,0,3,7,16,8,IRON,1.5)
        for y in [-7,7]:
            m.box(12,y,3,8,3,8,ALLOY)
    elif key == 'hook':
        m.tube('y',-5,5,-4,5,4,BRASS)
        for y in [-5,4]:
            m.tube('y',y,y+1,-4,5,4.7,IRON)
        m.box(5,0,4,16,2.4,2.4,STEEL)
        for sign in [-1,1]:
            ring=[(x,sign*y) for x,y in [(15,0),(13,4),(7,8),(4,8),(7,3),(8,5),(12,1)]]
            m.extrusion(ring,'z',4,6.5,ALLOY)
    elif key == 'pulse':
        m.tube('x',-9,14,0,6,3.1,ICE)
        for x,r in [(-8,4.7),(-3,5),(2,5.3),(8,6)]:
            m.tube('x',x,x+2.3,0,6,r,IRON)
        m.tube('x',13,15,0,6,5.7,STEEL)
        m.tube('x',15,15.4,0,6,3.7,ICE)
    elif key == 'disc':
        m.tube('z',2,5,0,0,7.8,IRON)
        m.tube('z',5,6.2,3,0,7.1,GREEN)
        m.tube('z',6.2,7,3,0,5.6,ALLOY)
        m.tube('z',7,8,3,0,2,IRON)
        for y in [-6,6]:
            m.box(6,y,5,17,2.4,3,STEEL)
    elif key == 'echo':
        m.box(-3,0,2,4,4,6,IRON)
        # Flared acoustic dish with recessed face and central feed.
        for x,r in [(-5,2.8),(-3,4.7),(-1,6.3),(1,8)]:
            m.tube('x',x,x+2,0,8,r,STEEL)
        m.tube('x',3,3.2,0,8,6.7,IRON)
        m.tube('x',3.2,8,0,8,1.4,ALLOY)
        m.tube('x',8,9.2,0,8,2,VIOLET)
    elif key == 'shield':
        shield=[(-7,-6),(2,-7),(9,0),(2,7),(-7,6)]
        for scale,z,h,color in [(1,2,3,STEEL),(.83,5,2,BLUE),(.55,7,.7,ICE)]:
            m.extrusion([(x*scale,y*scale) for x,y in shield],'z',z,z+h,color)
    elif key == 'nitro':
        for y in [-3.6,3.6]:
            m.tank(-8,y,5,13,3.1,BLUE)
            m.tube('x',-11,-8,y,5,3.5,STEEL)
            m.tube('x',-11.3,-11,y,5,2.6,IRON)
            m.tube('x',-11.5,-11.3,y,5,1.6,ICE)
    elif key == 'beacon':
        m.box(-2,0,2,11,9,4,IRON)
        m.tube('z',6,8,-2,0,4,BRASS)
        m.tube('z',8,13,-2,0,3.3,'#ff9d27')
        m.tube('z',13,14,-2,0,2.3,'#ffe2a1')
        m.tube('z',6,16,2,-2,.6,ALLOY)
    elif key == 'hologram':
        m.tube('z',2,5,-1,0,6.5,IRON,8)
        m.tube('z',5,6,-1,0,5.4,VIOLET)
        m.tube('z',6,7,-1,0,3.4,ALLOY)
        ring=[(-5,0),(-1,-3),(3,0),(-1,3)]
        for i,p in enumerate(ring):
            q=ring[(i+1)%4]
            m.faces.append(([(p[0],p[1],10),(q[0],q[1],10),(-1,0,16)],'#b897ff'))
            m.faces.append(([(p[0],p[1],10),(q[0],q[1],10),(-1,0,7)],VIOLET))
    elif key == 'treads':
        m.box(-1,0,2,19,9,5,RUBBER,3)
        for x in [-7,-1,5]:
            m.tube('y',-4.7,4.7,x,4,2.5,STEEL)
        for x in range(-9,9,3):
            m.box(x,0,6.6,1.8,9,1.4,IRON)
    return m


if __name__ == '__main__':
    OUTPUT.mkdir(exist_ok=True)
    keys = 'flame nitrogen pistol saw hammer hook pulse disc echo shield nitro beacon hologram treads'.split()
    for key in keys:
        model = equipment(key)
        for view in ['hangar','arena']:
            model.render(view == 'arena').save(OUTPUT / f'{key}-{view}.webp', lossless=True)
