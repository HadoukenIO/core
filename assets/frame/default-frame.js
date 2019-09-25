

const setupFrameButtons = () => {
    const win = fin.Window.getCurrentSync();

    const onClose = () => win.close();
    const onMinimize = () => win.minimize();
    const onMaximize = async () => win.getState().then(state => state === 'maximized'? win.restore() : win.maximize());
    
    const closeButton = document.getElementById('close-button');
    const minimizeButton = document.getElementById('minimize-button');
    const maximizeButton = document.getElementById('maximize-button');
    
    closeButton.addEventListener('click', onClose);
    minimizeButton.addEventListener('click', onMinimize);
    maximizeButton.addEventListener('click', onMaximize);
};

const setupLayout = () => {
    fin.Window.getCurrentSync().getOptions().then(({layout: layoutConfig}) => {
        let layoutContainer = document.getElementById('layout-container');
        var layout = new Layout(layoutConfig, layoutContainer);
        console.log(layout);
    });
};

setupFrameButtons();
setupLayout();
// const setupLayoutListeners = () => {
//     layout.on('tabCreated', tab => onTabCreated(tab, layout));
//     layout.on('itemDestroyed', e => onItemDestroyed(e, layout));
// }

// const setupLayoutState = () => {
//     layout.state = {};
// }

// const onTabCreated = tab => {
//     layout.state.isDragging = false;
//     const dragListener = tab._dragListener;
//     const identity = tab.contentItem.config.componentState.identity;

//     injectPopoutButton(tab);
//     dragListener.on('drag', onTabDrag.bind(this, tab._dragListener, identity));
// }

// const onItemDestroyed = e => {
//     //Need to wait a bit for the view to move (on a drag and drop)
//     setTimeout(() => {
//         if(e.componentName === 'browserView') {
//             const viewCount = layout.root.getComponentsByName('browserView').length;
//             if(viewCount === 0) {
//                 const currWin =  fin.Window.getCurrentSync();
//                 currWin.close().catch(console.error);
//             }
//         }
//     }, 100);
// }

// const injectPopoutButton = tab => {
//     const popoutButton = buildPopoutButton(tab);
//     const closeButton = tab.element[0].getElementsByClassName("lm_close_tab")[0];

//     tab.element[0].insertBefore(popoutButton, closeButton);
// }

// const buildPopoutButton = parentTab => {
//     const popoutButton = document.createElement('div');
//     popoutButton.className = 'popout-button';
//     popoutButton.onclick = () => onPopoutButtonClick(parentTab);

//     const popoutIcon = document.createElement('img');
//     popoutIcon.className = 'popout-icon';
//     popoutIcon.src = './icons8-new-window.svg';

//     popoutButton.appendChild(popoutIcon);
//     return popoutButton;
// }

// const onPopoutButtonClick = parentTab => {
//     const viewState = parentTab.contentItem.container.getState();

//     const popupLayout = generatePopoutLayoutConfig(viewState);
//     parentTab.contentItem.remove();

//     fin.Window.create({
//         defaultWidth: 700,
//         defaultHeight: 900,
//         name: `child-window-${Date.now()}`,
//         layout: popupLayout,
//         customFrame: true
//     });
// }

// const generatePopoutLayoutConfig = componentState => {
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

// const onTabDrag = (dragListener, tabIdentity) => {
//     if(!layout.state.isDragging) {
//         layout.state.isDragging = true;

//         const allViews = layout.root.getComponentsByName('browserView').map(item => item.container.getState().identity);
//         allViews.push(tabIdentity); // we have to add currently dragged tab manually since it's not in the DOM atm
//         allViews.forEach(view => fin.BrowserView.wrapSync(view).hide());
//         const onDragEnd = (e) => {
//             layout.state.isDragging = false;
//             allViews.forEach(view => fin.BrowserView.wrapSync(view).show());
//             dragListener.off('dragStop', onDragEnd);
//             updateViewTitles();
//         }
//         dragListener.on('dragStop', onDragEnd);
//     }
// }

// const updateViewTitles = () => {
//     const allViewWrappers = layout.root.getComponentsByName('browserView');
//     const allViewIdentities = allViewWrappers.map(item => item.container.getState().identity);
//     const allViews = allViewIdentities.map(fin.BrowserView.wrapSync.bind(fin));
//     allViews.forEach(async view => {
//         const {title} = await view.getInfo();
//         const [item] = findViewWrapper(view.identity)
//         if(!title || !item) console.error(`couldn't update view's title. view: ${JSON.stringify(view)}. title: ${title}. dom elem: ${item}`)
//         else {
//             item.container.setTitle(title);
//             item.container.getElement()[0].innerHTML = `<div class="wrapper_title">${title}</div>`
//         }
//     });
// }

// const findViewWrapper = ({name, uuid}) => {
//     return layout.root.getComponentsByName('browserView')
//         .filter( wrapper =>
//                     wrapper.componentState.identity.name === name &&
//                     wrapper.componentState.identity.uuid === uuid
//                 );
// }

// // frame logic
// setupFrameButtons();

// // layout logic
// const layoutContainer = document.getElementById('layout-container');

