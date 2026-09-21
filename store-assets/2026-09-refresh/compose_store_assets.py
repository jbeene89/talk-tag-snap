from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import argparse, hashlib, json, shutil

SPECS = {
 "viewer": {"brand":"IMAGE EXPLORER", "name":"Image Explorer", "accent":(56,221,194), "bg":(6,20,29), "footer":"Synthetic demo. Not for diagnosis.", "slides":[
  ("01-axial", ["Open your scans.","Keep them local."], "DICOM, NIfTI and compatible VA ZIPs."),
  ("02-coronal", ["Three views.","One study."], "Move through compatible CT volumes."),
  ("03-sagittal", ["A different angle.","A better overview."], "Switch views without leaving the study."),
  ("04-windowing", ["Find a clearer", "view."], "Adjust the display. Keep the original."),
  ("05-details", ["Know the file", "you opened."], "Review the image and study details."),
  ("06-guide", ["Start exploring.", "Skip the guesswork."], "A quick-start guide, ready to replay.")
 ]},
 "tag": {"brand":"SOUPYTAG", "name":"SoupyTag", "accent":(255,206,42), "bg":(16,16,12), "footer":"Example inspection. Actual app screens.", "slides":[
  ("01-markup", ["Show the problem.","Make it obvious."], "Mark a spot, add a note, share the detail."),
  ("02-detail", ["Mark the spot.","Add the detail."], "Clear notes and severity, in one place."),
  ("03-report", ["Give every photo", "a clear reference."], "Add a title and reference to your export."),
  ("04-sample", ["Get the hang of it.", "Then get to work."], "Try a bundled practice inspection."),
  ("05-settings", ["Your workflow.", "Your settings."], "Guidance, support and privacy controls."),
  ("06-guide", ["Four steps.", "A clearer handoff."], "Capture. Locate. Explain. Send.")
 ]}
}

def font(size, bold=False):
    candidates = (["C:/Windows/Fonts/segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"] if bold else ["C:/Windows/Fonts/segoeui.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"])
    for f in candidates:
        if Path(f).exists(): return ImageFont.truetype(f, size)
    raise RuntimeError("A system sans-serif font is required; font files are not bundled.")

def background(size, spec):
    w,h=size; image=Image.new("RGB",size); d=ImageDraw.Draw(image)
    for y in range(h):
        t=y/max(1,h-1); c=tuple(round(v*(1-.40*t)) for v in spec["bg"]); d.line((0,y,w,y), fill=c)
    glow=Image.new("RGBA",size); gd=ImageDraw.Draw(glow)
    gd.ellipse((w*.5,-h*.18,w*1.3,h*.33), fill=(*spec["accent"],24))
    image=Image.alpha_composite(image.convert("RGBA"),glow.filter(ImageFilter.GaussianBlur(w*.13))).convert("RGB")
    return image

def frame(image, screen, box):
    x,y,w,h=box; screen=screen.convert("RGB").resize((w,h),Image.Resampling.LANCZOS)
    shadow=Image.new("RGBA", image.size); sd=ImageDraw.Draw(shadow); sd.rounded_rectangle((x-8,y+8,x+w+8,y+h+20),radius=30,fill=(0,0,0,180)); image.paste(Image.alpha_composite(image.convert("RGBA"),shadow.filter(ImageFilter.GaussianBlur(20))).convert("RGB"))
    mask=Image.new("L",(w,h),0); ImageDraw.Draw(mask).rounded_rectangle((0,0,w-1,h-1),radius=21,fill=255)
    image.paste(screen,(x,y),mask); ImageDraw.Draw(image).rounded_rectangle((x-2,y-2,x+w+1,y+h+1),radius=23,outline=(70,81,87),width=2)

def compose(folder, app):
    folder=Path(folder); spec=SPECS[app]; records=[]
    for index,(stem,lines,subtitle) in enumerate(spec["slides"],1):
        raw=folder/"raw"/(stem+".png"); screen=Image.open(raw)
        if screen.size!=(1080,1920): raise ValueError(f"Unexpected native screenshot size: {raw} {screen.size}")
        image=background((1080,1920),spec); d=ImageDraw.Draw(image)
        d.text((70,54),f"SOUPY LABS  /  {spec['brand']}",font=font(22,True),fill=spec["accent"])
        d.text((966,54),f"{index:02d}",font=font(22,True),fill=spec["accent"])
        title_font=font(74,True)
        while max(d.textlength(line,font=title_font) for line in lines)>940: title_font=font(title_font.size-1,True)
        for n,line in enumerate(lines): d.text((68,105+n*91),line,font=title_font,fill=(244,248,250))
        subtitle_font=font(31)
        while d.textlength(subtitle,font=subtitle_font)>940: subtitle_font=font(subtitle_font.size-1)
        d.text((70,313),subtitle,font=subtitle_font,fill=(187,201,208))
        d.line((70,382,1010,382),fill=tuple(int(c*.25) for c in spec["accent"]),width=1)
        frame(image,screen,(136,417,808,1436))
        ImageDraw.Draw(image).text((70,1880),spec["footer"],font=font(20),fill=(146,161,168))
        out=folder/f"phone-{index:02d}.png"; image.save(out,optimize=True)
        records.append({"file":out.name,"raw":str(raw.relative_to(folder)),"alt_text":(spec["name"]+": "+" ".join(lines)+" "+subtitle)[:140],"sha256":hashlib.sha256(out.read_bytes()).hexdigest()})
    graphic=background((1024,500),spec); d=ImageDraw.Draw(graphic)
    d.text((54,46),"SOUPY LABS",font=font(23,True),fill=spec["accent"])
    title=["Image", "Explorer"] if app=="viewer" else ["SoupyTag"]
    for n,line in enumerate(title): d.text((50,110+n*76),line,font=font(68,True),fill=(244,248,250))
    taglines=["Your scans. Your perspective.","Explore compatible files locally."] if app=="viewer" else ["Mark the problem.","Make the next step obvious."]
    for n,line in enumerate(taglines): d.text((54,300+n*39),line,font=font(29),fill=(187,201,208))
    frame(graphic,Image.open(folder/"raw"/(spec["slides"][0][0]+".png")),(738,36,240,427))
    graphic.save(folder/"feature-graphic.png",optimize=True)
    sheet=background((1080,1400),spec); d=ImageDraw.Draw(sheet); d.text((34,32),spec["name"]+" / Store preview",font=font(32,True),fill=(244,248,250))
    for i in range(6):
        im=Image.open(folder/f"phone-{i+1:02d}.png").resize((330,587),Image.Resampling.LANCZOS); sheet.paste(im,(30+(i%3)*345,112+(i//3)*623))
    sheet.save(folder/"contact-sheet.jpg",quality=94)
    (folder/"screenshots.json").write_text(json.dumps({"app":spec["name"],"capture":"Android emulator, actual running app, sample data; no patient or customer records", "phone_dimensions":[1080,1920],"feature_graphic_dimensions":[1024,500],"screenshots":records},indent=2)+"\n",encoding="utf-8")
    if Path(__file__).resolve() != (folder/"compose_store_assets.py").resolve():
        shutil.copy2(__file__,folder/"compose_store_assets.py")
    print(f"Created six store screenshots, feature graphic and contact sheet: {folder}")

if __name__=="__main__":
    p=argparse.ArgumentParser(); p.add_argument("app",choices=SPECS); p.add_argument("folder",type=Path); args=p.parse_args(); compose(args.folder,args.app)
