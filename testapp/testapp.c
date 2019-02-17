#include <stdio.h>

int subroutine() 
{
    FILE *fp;
    int c;
    char* file = __FILE__;
    printf("%s\n",file);
    fp = fopen("testapp/"__FILE__,"r");
    do {
         c = getc(fp);
         putchar(c);
    }
    while(c != EOF);
    fclose(fp);
}

int main()
{
    subroutine();
    return 0;
}