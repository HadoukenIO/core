class Layout {
    constructor(config, container) {

        this.layout = new GoldenLayout(config, container);
        this.isDragging = false;

        // this.createChannelConnections();
        this.init();
    }

    get() {
        return this.layout;
    }

    async init() {
        //Restore the layout.
        // await this.restore();
        this.layout.registerComponent( 'browserView', function( container, componentState ){
            return { componentState, container };
        });
        this.setupListeners();
        this.layout.init();

        const win = fin.Window.getCurrentSync();

        win.on('close-requested', async () => {
            // await this.save();
            await win.close(true);
        });
    }

    setupListeners() {
        fin.Window.getCurrentSync().on('bounds-changed', e => {
            this.layout.updateSize();
        });
        this.layout.on('tabCreated', this.onTabCreated.bind(this));
        this.layout.on('itemDestroyed', this.onItemDestroyed.bind(this));
        this.layout.on('initialised', this.initializeViews.bind(this));
    }

    onTabCreated(tab) {
        this.isDragging = false;
        const dragListener = tab._dragListener;
        const identity = tab.contentItem.config.componentState.identity;
        
        // this.injectPopoutButton(tab);
        dragListener.on('drag', this.onTabDrag.bind(this, tab._dragListener, identity));
    }

    // injectPopoutButton(tab) {
    //     const onPopooutButtonClick = async () => {
    //         const viewState = tab.contentItem.container.getState();

    //         const popupLayout = this.generateLayoutConfig(viewState);
    //         tab.contentItem.remove();
    //         await createWindow(popupLayout);

    //     };
    //     const popoutButton = html`<div @click=${onPopooutButtonClick}>${popoutIcon}</div>`;
    //     const closeButton = tab.element[0].getElementsByClassName("lm_close_tab")[0];
    //     const wrapper = document.createElement('div');
    //     wrapper.className = 'popout-button';
    //     render(popoutButton, wrapper);
    //     tab.element[0].insertBefore(wrapper, closeButton);
    // }

    onItemDestroyed(e) {
        //Need to wait a bit for the view to move (on a drag and drop)
        setTimeout(() => {
            if(e.componentName === 'browserView') {
                const viewCount = this.layout.root.getComponentsByName('browserView').length;
                if(viewCount === 0) {
                    const currWin =  fin.Window.getCurrentSync();
                    currWin.close().catch(console.error);
                }
            }
        }, 100);
    }

    onTabDrag(dragListener, tabIdentity) {
        if(!this.isDragging) {
            this.isDragging = true;

            const allViews = this.layout.root.getComponentsByName('browserView').map(item => item.container.getState().identity);
            allViews.push(tabIdentity); // we have to add currently dragged tab manualy since it's not in the DOM atm
            allViews.forEach(view => fin.BrowserView.wrapSync(view).hide());
            const onDragEnd = (e) => {
                this.isDragging = false;
                allViews.forEach(view => fin.BrowserView.wrapSync(view).show());
                dragListener.off('dragStop', onDragEnd);
                this.updateViewTitles();
            }
            dragListener.on('dragStop', onDragEnd);
        }
    }

    // //TODO: get better names around this.
    // async createChannelConnections () {
    //     //TODO: this could be shared logic somewhere.
    //     const { identity } = fin.Window.getCurrentSync();
    //     const channelName = `${identity.uuid}-${identity.name}-custom-frame`;
    //     this.client = await getClient();

    //     //TODO: reusing the same name is al sorts of wrong for this thing...do something else.
    //     this.client.register('add-view', async (viewConfig) => {

    //         const content = {
    //             type: 'component',
    //             componentName: 'browserView',
    //             componentState: viewConfig
    //         };

    //         console.log('adding stuff');
    //         console.log(this.layout.root.contentItems[ 0 ].addChild(content));

    //         var bv = this.getBrowserViewComponent(viewConfig.identity);
    //         const rView = new ResizableView(bv.componentState);
    //         rView.renderIntoComponent(bv);

    //         return content;
    //     });

    //     this.client.register('get-views', async () => {
    //         return this.layout.root.getComponentsByName('browserView').map(bv => bv.componentState);
    //     });

    //     this.client.register('remove-view', async(viewConfig) => {
    //         console.log(viewConfig);
    //         var bv = this.getBrowserViewComponent(viewConfig.identity);
    //         await fin.BrowserView.wrapSync(viewConfig.identity).hide();
    //         bv.container.tab.contentItem.remove();
    //     });

    //     await fin.InterApplicationBus.subscribe({ uuid: '*' }, 'should-tab-to', async (identity) => {
    //         const views = this.layout.root.getComponentsByName('browserView').map(bv => bv.componentState);
    //         for (let v of views) {
    //             await moveView(v, fin.Window.getCurrentSync().identity, identity);
    //         }
    //     })
    // }

    // getBrowserViewComponent(identity) {
    //     return this.layout.root.getComponentsByName('browserView').find(bv => bv.componentState.identity.name === identity.name);
    // }

    // getStorageKey() {
    //     const identity = fin.Window.getCurrentSync().identity;
    //     return encodeURI(`${identity.uuid}-${identity.name}-of-gl-state`);
    // }

    attachViews() {
        const browserViews = this.layout.root.getComponentsByName('browserView');
        browserViews.forEach(bv => {
            const rView = new ResizableView(bv.componentState);
            rView.renderIntoComponent(bv);
        });
    }

    // async getDefaultConfig() {
    //     const { customData } = await fin.Window.getCurrentSync().getOptions();
    //     return customData;
    // }

    async initializeViews() {
        this.attachViews();
        this.updateViewTitles();
        //setInterval(this.updateViewTitles.bind(this), 500);
    }

    async updateViewTitles() {
        const allViewWrappers = this.layout.root.getComponentsByName('browserView');
        const allViewIdentities = allViewWrappers.map(item => item.container.getState().identity);
        const allViews = allViewIdentities.map(fin.BrowserView.wrapSync.bind(fin));
        allViews.forEach(async view => {
            let {title} = await view.getInfo();
            const [item] = this.findViewWrapper(view.identity)
            title = title || item.componentState.componentName || item.componentState.url;

            if(!title || !item) console.error(`couldn't update view's title. view: ${JSON.stringify(view)}. title: ${title}. dom elem: ${item}`)
            else {
                item.container.setTitle(title);
                item.container.getElement()[0].innerHTML = `<div class="wrapper_title">${title}</div>`
            }
        });
    }

    // async save() {
    //     if (this.layout) {
    //         const config = this.layout.toConfig();
    //         if(!config.content || !config.content.length) return;
    //         const state = JSON.stringify(config);
    //         localStorage.setItem(this.getStorageKey(), state);
    //     }
    // }

    findViewWrapper ({name, uuid}) {
        return this.layout.root.getComponentsByName('browserView')
            .filter( wrapper =>
                     wrapper.componentState.identity.name === name &&
                     wrapper.componentState.identity.uuid === uuid
                   );
    }

    // //TODO: figure out how to iterate over a saved layout to get the browser view information.
    // async restore() {
    //     const savedState = localStorage.getItem(this.getStorageKey());

    //     if (this.layout) {
    //         this.layout.destroy();
    //     }

    //     if (savedState !== null) {
    //         this.layout = new GoldenLayout(JSON.parse(savedState));
    //     } else {
    //         const { customData } = await fin.Window.getCurrentSync().getOptions();
    //         this.layout = new GoldenLayout(customData);
    //     }

    //     this.layout.registerComponent( 'browserView', function( container, componentState ){
    //         return { componentState, container };
    //     });
    // }

    // async restoreDefault() {
    //     localStorage.removeItem(this.getStorageKey());
    //     this.restore();
    // }

    // generateLayoutConfig(componentState) {

    //     return {
    //         settings: {
    //             showPopoutIcon: false,
    //             showMaximiseIcon: false,
    //             showCloseIcon: false,
    //             constrainDragToContainer: false
    //         },
    //         content: [{
    //             type: 'row',
    //             content:[{
    //                 type: 'stack',
    //                 content:[{
    //                     type: 'component',
    //                     componentName: 'browserView',
    //                     componentState
    //                 }]
    //             }]
    //         }]
    //     };
    // }
}