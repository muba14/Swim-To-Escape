import json, sys, math
from PIL import Image, ImageDraw
sys.path.insert(0,'.')
from levels import LEVELS, slide, DIRS
C=40
pal=dict(bg=(14,26,34),water=(12,22,32),wall=(20,50,58),teal=(63,214,200),pearl=(230,242,242),gold=(255,201,60),pink=(255,111,145),orange=(232,104,42))
OCT=['....LLLL....','...LLLLLL...','..LOOOOOOL..','..OOOOOOOO..','..OWBOOWBO..','..OBBOOBBO..','..OOOOOOOO..','..DOOOOOOD..','.ODODOODODO.','.D.D.DD.D.D.','D..D.D..D..D','............']
OP={'O':(232,104,42),'L':(246,140,60),'D':(196,70,42),'W':(255,255,255),'B':(20,16,26)}
def sprite(d,rows,pal,x0,y0,size):
    n=len(rows); p=size/n
    for y,r in enumerate(rows):
        for x,ch in enumerate(r):
            if ch in pal: d.rectangle([x0+x*p,y0+y*p,x0+(x+1)*p-1,y0+(y+1)*p-1],fill=pal[ch])
def swum(g,w,h,s):
    seen={s};q=[s];sw={s}
    while q:
        p=q.pop()
        for dx,dy in DIRS:
            e,path,o=slide(g,w,h,p[0],p[1],dx,dy)
            if not path or o=='dead':continue
            sw.update(path)
            if o=='stop' and e not in seen: seen.add(e);q.append(e)
    return sw
for i,rows in enumerate(LEVELS,1):
    g=[list(r) for r in rows];h=len(g);w=len(g[0])
    s=[(x,y) for y in range(h) for x in range(w) if g[y][x]=='S'][0]
    sw=swum(g,w,h,s)
    hud=70
    im=Image.new('RGB',(w*C,h*C+hud),pal['bg']);d=ImageDraw.Draw(im)
    oy=hud
    for y in range(h):
        for x in range(w):
            X,Y=x*C,y*C+oy;c=g[y][x]
            rock=lambda a,b: not(0<=a<w and 0<=b<h) or g[b][a]=='#'
            if c=='#':
                d.rectangle([X,Y,X+C-1,Y+C-1],fill=pal['wall'])
                t=4
                if not rock(x,y-1) and y>0: d.rectangle([X,Y,X+C-1,Y+t-1],fill=pal['teal'])
                if not rock(x,y+1) and y<h-1: d.rectangle([X,Y+C-t,X+C-1,Y+C-1],fill=pal['teal'])
                if not rock(x-1,y) and x>0: d.rectangle([X,Y,X+t-1,Y+C-1],fill=pal['teal'])
                if not rock(x+1,y) and x<w-1: d.rectangle([X+C-t,Y,X+C-1,Y+C-1],fill=pal['teal'])
            else:
                d.rectangle([X,Y,X+C-1,Y+C-1],fill=pal['water'])
                if c=='^':
                    for a in range(8):
                        ang=a*math.pi/4;d.line([X+C/2,Y+C/2,X+C/2+math.cos(ang)*C*.45,Y+C/2+math.sin(ang)*C*.45],fill=pal['pink'],width=3)
                    d.rectangle([X+C*.28,Y+C*.28,X+C*.72,Y+C*.72],fill=(176,48,106))
                elif c=='E':
                    for a in range(8):
                        ang=a*math.pi/4;cx=X+C/2+math.cos(ang)*C*.33;cy=Y+C/2+math.sin(ang)*C*.33
                        d.rectangle([cx-2,cy-2,cx+2,cy+2],fill=pal['pink'])
                elif c=='*':
                    pts=[];
                    for k in range(10):
                        r=C*.4 if k%2==0 else C*.17;ang=-math.pi/2+k*math.pi/5;pts.append((X+C/2+math.cos(ang)*r,Y+C/2+math.sin(ang)*r))
                    d.polygon(pts,fill=pal['gold'])
                elif c=='c':
                    d.pieslice([X+6,Y+8,X+C-6,Y+C+8],180,360,fill=pal['gold']);d.rectangle([X+C/2-4,Y+C-12,X+C/2+4,Y+C-6],fill=(201,134,26))
                elif c=='S':
                    sprite(d,OCT,OP,X,Y,C)
                elif (x,y) in sw:
                    d.rectangle([X+C/2-3,Y+C/2-3,X+C/2+3,Y+C/2+3],fill=pal['pearl'])
    pearls=sum(1 for (x,y) in sw if g[y][x]=='.')
    d.text((14,16),f"0",fill='white');d.text((w*C/2-40,40),f"0/{pearls} INCI",fill=pal['teal'])
    for k in range(3): d.text((w*C/2-24+k*18,18),"*",fill=(42,62,70))
    im.save(f'../screenshots/level{i}.png')
print('done')
