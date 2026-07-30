from PIL import Image, ImageDraw

S = 1024
im = Image.new('RGB', (S, S), '#F7FAFC')
d = ImageDraw.Draw(im)

# Rounded app tile and navy shopping bag silhouette.
d.rounded_rectangle((0, 0, S, S), radius=216, fill='#F7FAFC')
d.rounded_rectangle((235, 300, 789, 870), radius=92, fill='#102A43')
d.line((398, 344, 398, 314, 430, 230, 512, 200, 594, 230, 626, 314, 626, 344), fill='#102A43', width=54, joint='curve')

# Analytics bars.
d.rounded_rectangle((344, 606, 426, 748), radius=18, fill='#12B8D6')
d.rounded_rectangle((471, 520, 553, 748), radius=18, fill='#18C5C0')
d.rounded_rectangle((598, 430, 680, 748), radius=18, fill='#20D4A7')

# Upward trend line and arrow.
d.line((352, 560, 478, 457, 564, 507, 698, 383), fill='#20D4A7', width=38, joint='curve')
d.line((698, 383, 772, 373, 763, 448), fill='#20D4A7', width=38, joint='curve')

im.save('ecommerce-data-platform-logo.png')
