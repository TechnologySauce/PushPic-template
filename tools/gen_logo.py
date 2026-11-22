"""PushPic logo v2：透明背景的抽象「图片 + 上传」标记，Pillow 程序化绘制。"""
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 512
K = 4  # 超采样倍率，边缘更平滑
W = S * K

def C(v):
    return int(v * K)

def rounded_mask(size, box, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=radius, fill=255)
    return m

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))

# ---------- 主画布（全透明） ----------
img = Image.new('RGBA', (W, W), (0, 0, 0, 0))

# ---------- 1. 斜置的圆角「图片卡片」底板，带蓝紫渐变 ----------
card = Image.new('RGBA', (W, W), (0, 0, 0, 0))
cd = ImageDraw.Draw(card)
box = (C(78), C(96), C(434), C(416))
cd.rounded_rectangle(box, radius=C(74), fill=(255, 255, 255, 255))

grad = Image.new('RGB', (W, W))
gp = grad.load()
top, bottom = (108, 124, 255), (78, 66, 214)  # 亮蓝 -> 靛紫
for y in range(W):
    col = lerp(top, bottom, y / (W - 1))
    for x in range(W):
        gp[x, y] = col
card.putalpha(card.getchannel('A'))
card_rgb = Image.new('RGBA', (W, W), (0, 0, 0, 0))
card_rgb.paste(grad, (0, 0))
card_rgb.putalpha(card.getchannel('A'))
img.alpha_composite(card_rgb)

# 顶部高光弧，增加立体感
hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
hd = ImageDraw.Draw(hl)
hd.rounded_rectangle((C(96), C(112), C(416), C(400)), radius=C(64),
                     outline=(255, 255, 255, 46), width=C(3))
img.alpha_composite(hl)

# ---------- 2. 卡片内的「山峦图片」符号（白色剪影） ----------
art = Image.new('RGBA', (W, W), (0, 0, 0, 0))
ad = ImageDraw.Draw(art)
white = (255, 255, 255, 255)
# 太阳（放左上，避开右上角徽标）
ad.ellipse((C(150), C(168), C(214), C(232)), fill=white)
# 远山 + 近山：两个三角形构成图片意象
ad.polygon([(C(118), C(340)), (C(232), C(226)), (C(346), C(340))], fill=white)
ad.polygon([(C(228), C(340)), (C(320), C(252)), (C(410), C(340))], fill=(255, 255, 255, 235))
# 裁掉超出卡片的部分
art.putalpha(ImageChops.multiply(art.getchannel('A'), card.getchannel('A')))
img.alpha_composite(art)

# ---------- 3. 右上角实心圆角「上传箭头」徽标，镂空描边 ----------
badge = Image.new('RGBA', (W, W), (0, 0, 0, 0))
bd = ImageDraw.Draw(badge)
bbox = (C(300), C(60), C(452), C(212))
bd.ellipse(bbox, fill=(46, 214, 160, 255))            # 青绿色，和蓝紫主色对比
bd.ellipse(bbox, outline=(10, 30, 40, 40), width=C(3))
# 白色上箭头（杆 + 三角头）
bd.rounded_rectangle((C(366), C(128), C(386), C(184)), radius=C(6), fill=white)
bd.polygon([(C(376), C(100)), (C(414), C(142)), (C(392), C(142)),
            (C(392), C(150)), (C(360), C(150)), (C(360), C(142)), (C(338), C(142))], fill=white)
img.alpha_composite(badge)

# ---------- 4. 输出多尺寸 ----------
out = img.resize((S, S), Image.Resampling.LANCZOS)
out.save('assets/img/logo.png', optimize=True)
out.resize((180, 180), Image.Resampling.LANCZOS).save('assets/img/logo-180.png', optimize=True)
out.resize((64, 64), Image.Resampling.LANCZOS).save('assets/img/favicon-64.png', optimize=True)
out.save('assets/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print('logo v2 written')
