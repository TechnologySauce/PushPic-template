"""Generate PushPic transparent PNG favicon/logo with Pillow (no external assets)."""
from PIL import Image, ImageDraw

S = 512
SS = 4
img = Image.new('RGBA', (S * SS, S * SS), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
k = SS

# Rounded tile with vertical gradient and a subtle outline.
r = 112 * k
tile = Image.new('RGBA', (S * SS, S * SS), (0, 0, 0, 0))
td = ImageDraw.Draw(tile)
td.rounded_rectangle((40*k, 40*k, (S-40)*k, (S-40)*k), radius=r, fill=(255, 255, 255, 255))
grad = Image.new('RGB', (1, S*SS))
gp = grad.load()
for y in range(S*SS):
    t = y / (S*SS - 1)
    gp[0, y] = (int(110 + (62-110)*t), int(132 + (86-132)*t), int(255 + (218-255)*t))
mask = tile.getchannel('A')
base = Image.new('RGBA', img.size, (0, 0, 0, 0))
base.paste(grad.resize(img.size), (0, 0))
base.putalpha(mask)
img.alpha_composite(base)

# Soft inner top highlight.
d.rounded_rectangle((52*k, 52*k, (S-52)*k, (S-52)*k), radius=(r-12*k),
                    outline=(255, 255, 255, 62), width=3*k)

# Cloud silhouette (a blob of three circles + a flat base), drawn white.
white = (255, 255, 255, 255)
cloud_y = 285 * k
d.ellipse((120*k, cloud_y-58*k, 268*k, cloud_y+70*k), fill=white)
d.ellipse((198*k, cloud_y-110*k, 372*k, cloud_y+66*k), fill=white)
d.ellipse((300*k, cloud_y-62*k, 414*k, cloud_y+72*k), fill=white)
d.rounded_rectangle((126*k, cloud_y+8*k, 402*k, cloud_y+74*k), radius=32*k, fill=white)

# Up-arrow carved in the cloud with the gradient colour.
arrow = Image.new('RGBA', img.size, (0, 0, 0, 0))
ad = ImageDraw.Draw(arrow)
ad.rounded_rectangle((238*k, 214*k, 292*k, 360*k), radius=12*k, fill=(255, 255, 255, 255))
ad.polygon([(265*k, 172*k), (350*k, 254*k), (302*k, 254*k),
            (302*k, 300*k), (228*k, 300*k), (228*k, 254*k), (180*k, 254*k)], fill=(255, 255, 255, 255))
# Punch the arrow out of the cloud by using it as an eraser on the white layer.
cloud_layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
cd = ImageDraw.Draw(cloud_layer)
cd.ellipse((120*k, cloud_y-58*k, 268*k, cloud_y+70*k), fill=white)
cd.ellipse((198*k, cloud_y-110*k, 372*k, cloud_y+66*k), fill=white)
cd.ellipse((300*k, cloud_y-62*k, 414*k, cloud_y+72*k), fill=white)
cd.rounded_rectangle((126*k, cloud_y+8*k, 402*k, cloud_y+74*k), radius=32*k, fill=white)
# Composite arrow-hole using ImageChops for correctness.
from PIL import ImageChops
cloud_layer.putalpha(ImageChops.subtract(cloud_layer.getchannel('A'), arrow.getchannel('A')))
img.alpha_composite(cloud_layer)

# Recolour the carved arrow with the brand gradient.
arrow_layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
arrow_layer.paste(grad.resize(img.size), (0, 0))
arrow_layer.putalpha(arrow.getchannel('A'))
img.alpha_composite(arrow_layer)

out = img.resize((S, S), Image.LANCZOS)
out.save('assets/img/logo.png', optimize=True)
out.resize((180, 180), Image.LANCZOS).save('assets/img/logo-180.png', optimize=True)
out.resize((64, 64), Image.LANCZOS).save('assets/img/favicon-64.png', optimize=True)
# ICO with multiple sizes.
out.save('assets/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print('logos written')
