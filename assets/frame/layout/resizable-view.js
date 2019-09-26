const delay = (delay) => new Promise(resolve => setTimeout(resolve, delay));

class ResizableView {
    constructor(options) {
        const currWin = fin.Window.getCurrentSync();
        const identity = { uuid: currWin.identity.uuid, name: options.identity.name };
        this.options = {
            autoResize: {
                width: false,
                height: false
            },
            uuid: identity.uuid,
            name: identity.name,
            url: options.url,
            target: currWin.identity,
            bounds: {
                x: 1,
                y: 1,
                width: 0,
                height: 0
            },
            showDevTools: options.showDevTools
        };
        this.componentKey = `bv-container${ identity.uuid }-${ identity.name }`;
        const resizeObserver = new ResizeObserver(entries => {
            if (this.view) {
                for (let entry of entries) {
                    const cr = entry.contentRect;
                    console.log('Element:', entry.target);
                    console.log(`Element size: ${cr.width}px x ${cr.height}px`);
                    console.log(`Element padding: ${cr.top}px ; ${cr.left}px`);

                    var rect = entry.target.getBoundingClientRect();
                    console.log(rect.top, rect.right, rect.bottom, rect.left);
                    // height
                    // width
                    // top
                    // left
                    // right
                    // bottom
                    this.view.setBounds({
                        height: Math.floor(cr.height),
                        width: Math.floor(cr.width),
                        y: Math.floor(rect.top),
                        x: Math.floor(rect.left),
                        right: Math.floor(rect.right),
                        bottom: Math.floor(rect.bottom)
                    }).catch(console.error).then(() => console.log('did it'));
                }
            }
        });

        this.resizeObserver = resizeObserver;
        this.renderIntoComponent = this.renderIntoComponent.bind(this);
    }

    async renderIntoComponent(opts) {
        try {
            this.view = await this.createOrAttachView();
            const { container } = opts;

            this.resizeObserver.observe(container.getElement()[0]);
        } catch (err) {
            console.error(err);
        }
        return;
    }

    async createOrAttachView() {
        let view;
        try {
            view = await fin.BrowserView.create(this.options);
            //view.getInfo && view.getInfo(); // the hackiest hack. remove once we have BV events.
            await delay(100);
        } catch (e) {
            console.log('in the catch');
            const { identity } = fin.Window.getCurrentSync();
            view = fin.BrowserView.wrapSync({ uuid: this.options.uuid, name: this.options.name });

            await view.attach(identity);
            await view.hide();
            await view.show();
        }
        return view;
    }
}
