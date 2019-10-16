import { isBase64 } from '../src/common/main';
import * as assert from 'assert';

describe('IsBase64', () => {

    it('Should return true if given a simple base64 encoded string', () => {
        const str: string = 'SGVsbG8gV29ybGQh'; // 'Hello world!'
        const expected  = true;
        const result = isBase64(str);

        assert.equal(result, expected, 'Expected result to be true with a base64 encoded string');
    });

    it('Should return true if given a base64 encoded image icon string', () => {
        // tslint:disable-next-line
        const str: string = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAABKVBMVEUAAABSTf9QTP9TUP9RTf9jXP9PS/9SUP9OSv9QTf9TTv9VUP9PSf9RTv9WTv9KRv9RTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTf9QTP9QTP9QTP9UUP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9TTv9RTf9QTP9QTP9QTP9QTP9RTf9QTP9QTP9QTf9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9RTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9QTP9RTf9QTP9QTP9QTP9QTf9QTP9QTP9QTP9TT/9QTP9UUf9QTP////+c69uyAAAAYXRSTlMAAAAAAAAAAAAAAAAAAAAADm3R+PnScA8QmZwSfP2AAR/a3CFHS1T8/l478n0Rwr9Q7QEDXexsDQJIPAEmb5qrzve+eVoe2/PDE1gN7i9uzxSs0FcOLg4S3voT3cBKAV8BobrzZQAAAAFiS0dEYiu5HTwAAAAHdElNRQfiAgQJJyMViSyGAAABjklEQVQ4y31TeV+CQBBdRzqorBQENDQTz9LSsLIShQ5LLY+s7DCN7/8lEmHXa3P+25n3e/vmzQxCJFyw6/VxvF8QwY1oAVKAM0fBB/eAVmdW5JA5jlB4n6ERRA5MJ6IKjQJiHAbwcSogkcSAVJoKODzCADMDFBGQPSaAE5FCwUAuT0R4TykUjFqIphzE2fnF6hrOFyOXiavsOoPY65JWruiGheBubu9i90XG8k+ucsmHx5xqkW5sqrW63+mFq8oSoEbA9u+psMWOGT3w7MNakoEGahrOo1oCrLaOc6bRRC3SWxO2nYbbOkm2EPHXLO8wuJ0OSXJTgI5KBRBBpt6GxS9ekEAojK49AXZKJCeg12AIv3xv4JltMxR8R9ALf3w6Dvu6NVX96mKj+O9wDyyrlXha7o9/MvQKtrovp3+UIksWWtTIKK3IayK4Zkc50PhJndcGC+MGqT8B9KXFhXFBZgLIzPHbFEO8LWZqSF3aOBHxz9or0eWHw/yGl5/eyNMgbx9vj3q8yA2i4Ofnz/8PB9agG+57b98AAAAldEVYdGRhdGU6Y3JlYXRlADIwMTgtMDItMDRUMDk6Mzk6MzUrMDE6MDDl1ju7AAAAJXRFWHRkYXRlOm1vZGlmeQAyMDE4LTAyLTA0VDA5OjM5OjM1KzAxOjAwlIuDBwAAAFd6VFh0UmF3IHByb2ZpbGUgdHlwZSBpcHRjAAB4nOPyDAhxVigoyk/LzEnlUgADIwsuYwsTIxNLkxQDEyBEgDTDZAMjs1Qgy9jUyMTMxBzEB8uASKBKLgDqFxF08kI1lQAAAABJRU5ErkJggg==';
        const expected  = true;
        const result = isBase64(str);

        assert.equal(result, expected, 'Expected result to be true with a base64 encoded image icon');
    });

    it('Should return false if given a url', () => {
        const str: string = 'https://openfin.co/favicon-32x32.png';
        const expected  = false;
        const result = isBase64(str);

        assert.equal(result, expected, 'Expected result to be false with a http url');
    });

    it('Should return false if given a file url', () => {
        const str: string = 'file:///z:/dev/app-template-2/favicon.ico';
        const expected  = false;
        const result = isBase64(str);

        assert.equal(result, expected, 'Expected result to be false with a file url');
    });
});
